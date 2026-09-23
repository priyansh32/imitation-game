import { DurableObject } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { PersistentPlayer, type Observation } from "./player";
import {
  addMessage,
  behaviorDelay,
  castVote,
  NAMES,
  POPULATION,
  publicState,
  shuffle,
  SYMBOLS,
  transition,
  outcomeFor,
  type ParticipantBelief,
  type RoomEvent,
  type PrivatePlayer,
  type RoomState
} from "./game";
import type { ClientAction } from "./shared";
import { adminApi } from "./admin-api";
import { MODES, matchContext } from "./modes";
export { Matchmaker } from "./matchmaker";
export { PersistentPlayer };

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const cookie = (r: Request) =>
  r.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)human_session=([a-f0-9-]{36})/)?.[1] ?? "";
const playerStub = (env: Env, id: number) =>
  getAgentByName(env.PLAYERS, `player-${id}`);
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
async function body(r: Request): Promise<Record<string, unknown>> {
  const reader = r.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new RequestError("Request too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError("Invalid JSON", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RequestError("Invalid request", 400);
  return parsed as Record<string, unknown>;
}
function devAllowed(r: Request, env: Env) {
  const host = new URL(r.url).hostname;
  return (
    String(env.DEVELOPMENT) === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(host) &&
    !!env.DEV_TOKEN &&
    r.headers.get("X-Dev-Token") === env.DEV_TOKEN
  );
}
export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)"
    );
  }
  read(): RoomState | null {
    const row = this.ctx.storage.sql
      .exec<{ state: string }>("SELECT state FROM room WHERE id=1")
      .toArray()[0];
    return row ? JSON.parse(row.state) : null;
  }
  save(s: RoomState, publish = true) {
    s.revision++;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO room (id,state) VALUES (1,?)",
      JSON.stringify(s)
    );
    if (publish) {
      for (const socket of this.ctx.getWebSockets()) {
        try {
          const session = socket.deserializeAttachment()?.session ?? s.owner;
          if (!this.member(s, session)) continue;
          socket.send(
            JSON.stringify({
              type: "state",
              state: publicState(s, Date.now(), session)
            })
          );
        } catch {
          socket.close(1011, "Reconnect");
        }
      }
    }
  }
  member(s: RoomState, session: string) {
    return (
      s.players.find((p) => p.session === session) ??
      (s.mode !== "FIND_THE_AI" && s.owner === session
        ? s.players.find((p) => p.agentId === undefined)
        : undefined)
    );
  }
  hasSession(session: string) {
    const s = this.read();
    return (
      !!s &&
      !["reveal", "interrupted"].includes(s.phase) &&
      !!this.member(s, session) &&
      (s.expiresAt ?? 0) > Date.now()
    );
  }
  async joinWaiting(roomId: string, session: string, fast: boolean) {
    let s = this.read();
    const now = Date.now();
    if (!s) {
      s = {
        roomId,
        owner: "",
        mode: "FIND_THE_AI",
        revision: 0,
        phase: "waiting",
        round: 1,
        maxRounds: 4,
        deadline: 0,
        expiresAt: now + 24 * 60 * 60 * 1000,
        players: [],
        messages: [],
        votes: {},
        results: [],
        pending: [],
        reflection: {},
        reflectionBusy: {},
        durations: fast
          ? { arrival: 1200, discussion: 8000, voting: 6000, elimination: 1800 }
          : {
              arrival: 4500,
              discussion: 65000,
              voting: 18000,
              elimination: 5500
            }
      };
    }
    if (s.phase !== "waiting") return false;
    if (this.member(s, session)) return true;
    s.players = s.players.filter(
      (p) => !p.disconnectedAt || now - p.disconnectedAt < 15000
    );
    if (s.players.length >= MODES.FIND_THE_AI.humans) return false;
    s.players.push({
      id: crypto.randomUUID(),
      name: "",
      symbol: "",
      eliminated: false,
      session,
      disconnectedAt: now,
      nextThink: now,
      busyUntil: 0,
      lastSent: 0,
      suspicion: {},
      hypothesis: ""
    });
    this.save(s);
    await this.ctx.storage.setAlarm(now + 500);
    return true;
  }
  async startWaiting() {
    const s = this.read();
    if (
      !s ||
      s.phase !== "waiting" ||
      s.players.length !== MODES.FIND_THE_AI.humans ||
      s.players.some((p) => p.disconnectedAt)
    )
      return;
    const token = crypto.randomUUID();
    s.phase = "starting";
    s.startToken = token;
    s.deadline = Date.now() + 20000;
    this.save(s);
    try {
      const agentId = shuffle(POPULATION)[0];
      const profile = await (
        await playerStub(this.env, agentId)
      ).profile(agentId);
      const current = this.read();
      if (
        !current ||
        current.startToken !== token ||
        current.phase !== "starting"
      )
        return;
      if (
        current.players.length !== MODES.FIND_THE_AI.humans ||
        current.players.some((p) => p.disconnectedAt)
      ) {
        current.phase = "waiting";
        current.deadline = 0;
        this.save(current);
        return;
      }
      const now = Date.now();
      current.players.push({
        id: crypto.randomUUID(),
        name: "",
        symbol: "",
        eliminated: false,
        agentId,
        behavior: profile.behavior,
        nextThink: now,
        busyUntil: 0,
        lastSent: 0,
        suspicion: {},
        hypothesis: ""
      });
      const names = shuffle(NAMES),
        symbols = shuffle(SYMBOLS);
      current.players = shuffle(current.players).map((p, i) => ({
        ...p,
        id: crypto.randomUUID(),
        name: names[i],
        symbol: symbols[i]
      }));
      const ai = current.players.find((p) => p.agentId !== undefined)!;
      current.reflection[ai.id] = {
        games: profile.games,
        learned: false,
        status: "pending"
      };
      current.phase = "arrival";
      current.startedAt = now;
      current.deadline = now + current.durations.arrival;
      this.save(current);
    } catch {
      const current = this.read();
      if (current?.startToken === token) {
        current.phase = "waiting";
        current.deadline = 0;
        current.serviceNotice = "The room could not start. Retrying…";
        this.save(current);
      }
    }
  }
  async init(roomId: string, owner: string, fast = false) {
    if (this.read()) return;
    const ids = shuffle(POPULATION).slice(0, MODES.BLEND_IN.agents);
    const profiles = await Promise.all(
      ids.map(async (id) => (await playerStub(this.env, id)).profile(id))
    );
    if (this.read()) return;
    const names = shuffle(NAMES),
      symbols = shuffle(SYMBOLS),
      slots = shuffle([undefined, ...ids]);
    const now = Date.now();
    const players: PrivatePlayer[] = slots.map((agentId, i) => ({
      id: crypto.randomUUID(),
      name: names[i],
      symbol: symbols[i],
      eliminated: false,
      agentId,
      session: agentId === undefined ? owner : undefined,
      behavior: profiles.find((p) => p.agentId === agentId)?.behavior,
      nextThink: now,
      busyUntil: 0,
      lastSent: 0,
      suspicion: {},
      beliefs: {},
      hypothesis: ""
    }));
    const durations = fast
      ? { arrival: 1200, discussion: 8000, voting: 6000, elimination: 1800 }
      : { arrival: 4500, discussion: 65000, voting: 18000, elimination: 5500 };
    const s: RoomState = {
      roomId,
      mode: "BLEND_IN",
      startedAt: now,
      owner,
      expiresAt: now + 24 * 60 * 60 * 1000,
      revision: 0,
      phase: "arrival",
      round: 1,
      maxRounds: 4,
      deadline: now + durations.arrival,
      players,
      messages: [],
      votes: {},
      results: [],
      pending: [],
      durations,
      reflection: Object.fromEntries(
        players
          .filter((p) => p.agentId !== undefined)
          .map((p) => [
            p.id,
            {
              games: profiles.find((a) => a.agentId === p.agentId)!.games,
              learned: false,
              status: "pending"
            }
          ])
      ),
      reflectionBusy: {},
      eventVersion: 0,
      decisionTrace: {}
    };
    this.save(s);
    await this.ctx.storage.setAlarm(now + 500);
  }
  observe(s: RoomState, p: PrivatePlayer): Observation {
    const active = s.players.filter(
      (player) => player.id !== p.id && !player.eliminated
    );
    const beliefs: ParticipantBelief[] = active.map(
      (participant) =>
        p.beliefs?.[participant.id] ?? {
          participantId: participant.id,
          humanProbability:
            MODES[s.mode ?? "BLEND_IN"].role === "INFILTRATOR"
              ? 1
              : (p.suspicion[participant.id] ?? 0.5),
          threat: 0.5,
          confidence: 0.1,
          reasons: [],
          lastUpdatedAt: Date.now()
        }
    );
    const events: RoomEvent[] = [
      ...s.messages.slice(-20).map((message) => ({
        kind: "message" as const,
        participantId: message.sender,
        text: message.text,
        at: message.at,
        round: message.round
      })),
      ...s.results.slice(-4).map((result) => ({
        kind: "elimination" as const,
        targetParticipantId: result.eliminated,
        at: Date.now(),
        round: result.round
      })),
      ...Object.entries(s.ballots ?? {}).flatMap(([round, votes]) =>
        Object.entries(votes)
          .filter(([sender]) => sender === p.id)
          .map(([, target]) => ({
            kind: "vote" as const,
            participantId: p.id,
            targetParticipantId: target,
            at: Date.now(),
            round: Number(round)
          }))
      )
    ];
    return {
      self: p.id,
      context: matchContext(s.roomId, s.mode),
      participants: publicState(s).participants,
      messages: s.messages.slice(-60),
      results: s.results,
      phase: s.phase === "voting" ? "voting" : "discussion",
      round: s.round,
      suspicion: Object.fromEntries(
        beliefs.map((belief) => [belief.participantId, belief.humanProbability])
      ),
      hypothesis: p.hypothesis,
      beliefs,
      events,
      eventVersion: s.eventVersion ?? s.revision,
      ownVotes: Object.entries(s.ballots ?? {})
        .filter(([, votes]) => votes[p.id])
        .map(([round, votes]) => ({
          round: Number(round),
          target: votes[p.id]
        }))
    };
  }
  async think(snapshot: RoomState, original: PrivatePlayer) {
    try {
      const decision = await (
        await playerStub(this.env, original.agentId!)
      ).decide(original.agentId!, this.observe(snapshot, original));
      const s = this.read(),
        now = Date.now();
      const p = s?.players.find((p) => p.id === original.id);
      if (
        !s ||
        !p ||
        p.eliminated ||
        s.phase !== snapshot.phase ||
        s.round !== snapshot.round ||
        p.busyUntil !== original.busyUntil ||
        now >= s.deadline
      )
        return;
      p.busyUntil = 0;
      p.failures = 0;
      p.suspicion = decision.suspicion;
      p.beliefs = Object.fromEntries(
        (decision.beliefs ?? []).map((belief) => [belief.participantId, belief])
      );
      p.hypothesis = decision.hypothesis;
      const delay = Math.min(
        behaviorDelay(p.behavior!),
        Math.max(0, snapshot.deadline - now - 1000)
      );
      p.observedRevision = snapshot.eventVersion ?? snapshot.revision;
      p.nextThink = now + delay + 2500 + Math.random() * 9000;
      s.decisionTrace ??= {};
      s.decisionTrace[p.id] = {
        agentId: p.agentId!,
        observed:
          this.observe(snapshot, original).events?.at(-1)?.text ?? "room event",
        beliefs: decision.beliefs ?? [],
        action: decision.action,
        intent: decision.intent,
        reason: decision.reason,
        candidate: decision.text || undefined,
        novelty: decision.novelty,
        delay,
        at: now
      };
      if (
        s.phase === "voting" &&
        decision.action === "VOTE" &&
        decision.target
      ) {
        s.pending.push({
          sender: p.id,
          target: decision.target,
          at: Math.min(s.deadline - 1000, now + delay),
          round: s.round,
          phase: s.phase
        });
      } else if (
        s.phase === "discussion" &&
        decision.action === "MESSAGE" &&
        decision.text.trim()
      ) {
        if ((s.chainDepth ?? 0) >= 4 || (p.activityBudget ?? 1) <= 0) {
          p.nextThink = now + delay + 6000;
          this.save(s, false);
          return;
        }
        s.pending.push({
          sender: p.id,
          text: decision.text,
          at: now + delay,
          round: s.round,
          phase: s.phase
        });
        p.activityBudget = Math.max(0, (p.activityBudget ?? 1) - 1);
        if (
          decision.followUp &&
          Math.random() < p.behavior!.doubleTextFrequency &&
          (p.consecutiveMessages ?? 0) === 0
        )
          s.pending.push({
            sender: p.id,
            text: decision.followUp,
            at: now + delay + 2000 + Math.random() * 2000,
            round: s.round,
            phase: s.phase
          });
      }
      s.serviceNotice = undefined;
      this.save(s, false);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "agent_decision_failed",
          room: snapshot.roomId,
          error: String(error)
        })
      );
      const s = this.read(),
        p = s?.players.find((p) => p.id === original.id);
      if (s && p && p.busyUntil === original.busyUntil) {
        p.busyUntil = 0;
        p.failures = (p.failures ?? 0) + 1;
        p.nextThink = Date.now() + Math.min(60000, 5000 * 2 ** p.failures);
        if (
          /4006|free allocation|quota|not authorized/i.test(String(error)) ||
          s.players
            .filter((q) => q.agentId !== undefined && !q.eliminated)
            .every((q) => (q.failures ?? 0) >= 2)
        ) {
          s.phase = "interrupted";
          s.pending = [];
          s.deadline = 0;
        }
        s.serviceNotice =
          "Some participants are having connection trouble. The round will continue.";
        this.save(s);
      }
    }
  }
  async reflect(snapshot: RoomState, original: PrivatePlayer) {
    try {
      const stub = await playerStub(this.env, original.agentId!);
      const receipt = await stub.recordGame(
        original.agentId!,
        snapshot.roomId,
        snapshot.outcome!,
        {
          matchId: snapshot.roomId,
          mode: snapshot.mode ?? "BLEND_IN",
          role: MODES[snapshot.mode ?? "BLEND_IN"].role,
          result: snapshot.outcome!,
          survivalMs: Math.max(
            0,
            (original.eliminatedAt ?? snapshot.finishedAt ?? Date.now()) -
              (snapshot.startedAt ?? snapshot.finishedAt ?? Date.now())
          ),
          eliminationRound:
            snapshot.results.find((r) => r.eliminated === original.id)?.round ??
            (original.eliminated ? snapshot.round : null),
          votesReceived: snapshot.results.map((r) => ({
            round: r.round,
            count: r.counts[original.id] ?? 0
          })),
          votesCast: this.observe(snapshot, original).ownVotes,
          conversation: snapshot.messages,
          events: this.observe(snapshot, original).events ?? []
        }
      );
      const recorded = this.read();
      if (!recorded || recorded.finishedAt !== snapshot.finishedAt) return;
      recorded.reflection[original.id].games = receipt.games;
      this.save(recorded);
      const result = await stub.reflect(original.agentId!, snapshot.roomId, {
        observation: this.observe(snapshot, original),
        humanIds: snapshot.players
          .filter((p) => p.agentId === undefined)
          .map((p) => p.id),
        outcome: snapshot.outcome!
      });
      const s = this.read();
      if (!s || s.finishedAt !== snapshot.finishedAt) return;
      s.reflection[original.id] = { ...result, status: "complete" };
      const player = s.players.find((p) => p.id === original.id)!;
      player.suspicion = {};
      player.hypothesis = "";
      this.save(s);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "reflection_failed",
          room: snapshot.roomId,
          error: String(error)
        })
      );
      const s = this.read();
      if (!s || s.finishedAt !== snapshot.finishedAt) return;
      if (/4006|free allocation|quota|not authorized/i.test(String(error)))
        s.reflection[original.id].status = "unavailable";
      s.reflectionBusy[original.id] = Date.now() + 30000;
      this.save(s);
    }
  }
  async alarm() {
    const s = this.read();
    if (!s) return;
    const now = Date.now();
    if (s.expiresAt && now >= s.expiresAt) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room expired");
      await this.ctx.storage.deleteAll();
      return;
    }
    let changed = false;
    if (s.phase === "waiting" || s.phase === "starting") {
      const connected = new Set(
        this.ctx
          .getWebSockets()
          .filter((ws) => ws.readyState === 1)
          .map((ws) => ws.deserializeAttachment()?.session)
      );
      for (const p of s.players)
        if (!p.disconnectedAt && !connected.has(p.session))
          p.disconnectedAt = now;
      s.players = s.players.filter(
        (p) => !p.disconnectedAt || now - p.disconnectedAt < 15000
      );
      if (
        s.phase === "starting" &&
        (now >= s.deadline ||
          s.players.length < MODES.FIND_THE_AI.humans ||
          s.players.some((p) => p.disconnectedAt))
      ) {
        s.phase = "waiting";
        s.startToken = undefined;
        s.deadline = 0;
      }
      this.save(s);
      await this.startWaiting();
      await this.ctx.storage.setAlarm(
        s.players.length ? now + 1000 : s.expiresAt!
      );
      return;
    }
    // After a minute away, forfeit the seat. Deadlines still advance even with missing votes.
    if (!["reveal", "interrupted", "elimination"].includes(s.phase)) {
      for (const p of s.players) {
        if (
          p.agentId === undefined &&
          !p.eliminated &&
          p.disconnectedAt &&
          now - p.disconnectedAt >= 60000
        ) {
          p.eliminated = true;
          p.eliminatedAt = now;
          changed = true;
          delete s.votes[p.id];
          for (const [voter, target] of Object.entries(s.votes))
            if (target === p.id) delete s.votes[voter];
          s.pending = s.pending.filter(
            (a) => a.sender !== p.id && a.target !== p.id
          );
        }
      }
      if (changed) {
        s.eventVersion = (s.eventVersion ?? 0) + 1;
        s.outcome = outcomeFor(s);
        if (s.outcome) {
          s.phase = "elimination";
          s.deadline = now + s.durations.elimination;
          s.pending = [];
        }
      }
    }
    if (
      s.phase !== "reveal" &&
      s.phase !== "interrupted" &&
      now >= s.deadline
    ) {
      transition(s, now);
      changed = true;
    }
    const due = s.pending.filter((a) => a.at <= now);
    s.pending = s.pending.filter((a) => a.at > now);
    for (const a of due) {
      if (a.phase !== s.phase || a.round !== s.round) continue;
      const err = a.target
        ? castVote(s, a.sender, a.target, a.round, now)
        : addMessage(s, a.sender, a.text ?? "", crypto.randomUUID(), now);
      if (!err) changed = true;
    }
    const jobs: PrivatePlayer[] = [];
    if (s.phase === "discussion" || s.phase === "voting") {
      for (const p of shuffle(s.players)) {
        if (jobs.length >= 2) break;
        const eventChanged =
          (p.observedRevision ?? -1) < (s.eventVersion ?? s.revision);
        const idleEnough = now - (p.lastMessageAt ?? 0) > 12000;
        if (
          p.agentId === undefined ||
          p.eliminated ||
          p.busyUntil > now ||
          p.nextThink > now ||
          s.pending.some((a) => a.sender === p.id)
        )
          continue;
        if (!eventChanged && !idleEnough) continue;
        if (s.phase === "voting" && s.votes[p.id]) continue;
        p.nextThink = now + behaviorDelay(p.behavior!);
        if (
          s.phase === "discussion" &&
          ((p.decisions ?? 0) >= 4 ||
            (p.activityBudget ?? 1) <= 0 ||
            Math.random() > p.behavior!.responseProbability)
        )
          continue;
        p.decisions = (p.decisions ?? 0) + 1;
        p.busyUntil = now + 25000;
        jobs.push({ ...p });
      }
      // Close early only when everybody has voted. Otherwise missing votes abstain at deadline.
      if (
        s.phase === "voting" &&
        Object.keys(s.votes).length ===
          s.players.filter((p) => !p.eliminated).length
      ) {
        transition(s, now);
        changed = true;
        jobs.length = 0;
      }
    }
    const reflections: PrivatePlayer[] = [];
    if (s.phase === "reveal")
      for (const p of s.players) {
        if (
          p.agentId === undefined ||
          s.reflection[p.id]?.status !== "pending" ||
          (s.reflectionBusy[p.id] ?? 0) > now
        )
          continue;
        if (now - s.finishedAt! > 15 * 60000) {
          s.reflection[p.id].status = "unavailable";
          changed = true;
          continue;
        }
        s.reflectionBusy[p.id] = now + 45000;
        reflections.push({ ...p });
      }
    this.save(s, changed);
    for (const p of jobs) this.ctx.waitUntil(this.think(s, p));
    for (const p of reflections) this.ctx.waitUntil(this.reflect(s, p));
    const pending =
      s.phase !== "interrupted" &&
      (s.phase !== "reveal" ||
        Object.values(s.reflection).some((r) => r.status === "pending"));
    if (pending)
      await this.ctx.storage.setAlarm(
        now + (s.phase === "reveal" ? 3000 : 500)
      );
    else if (s.expiresAt) await this.ctx.storage.setAlarm(s.expiresAt);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const s = this.read();
    if (!s) return json({ error: "This room is no longer available." }, 404);
    if (
      url.pathname.endsWith("/dev/inspect") &&
      devAllowed(request, this.env)
    ) {
      const agents = await Promise.all(
        s.players
          .filter((p) => p.agentId !== undefined)
          .map(async (p) =>
            (await playerStub(this.env, p.agentId!)).profile(p.agentId!)
          )
      );
      const experiences = await Promise.all(
        s.players
          .filter((p) => p.agentId !== undefined)
          .map(async (p) =>
            (await playerStub(this.env, p.agentId!)).experience(s.roomId)
          )
      );
      return json({ room: s, agents, experiences });
    }
    if (url.pathname.includes("/dev/")) {
      if (!devAllowed(request, this.env))
        return json({ error: "Not found" }, 404);
      if (request.method !== "POST")
        return json({ error: "Method not allowed" }, 405);
      const input = await body(request);
      if (url.pathname.endsWith("/dev/expire-disconnects")) {
        const latest = this.read()!;
        for (const p of latest.players)
          if (p.disconnectedAt) p.disconnectedAt = Date.now() - 60001;
        this.save(latest);
        await this.ctx.storage.setAlarm(Date.now() + 50);
        return json({ ok: true });
      }
      if (url.pathname.endsWith("/dev/advance")) {
        const latest = this.read()!;
        transition(latest, Date.now());
        this.save(latest);
        await this.ctx.storage.setAlarm(Date.now() + 50);
        return json(publicState(latest));
      }
      if (url.pathname.endsWith("/dev/votes")) {
        const latest = this.read()!;
        if (latest.phase !== "voting" || typeof input.target !== "string")
          return json({ error: "Voting phase and target required" }, 400);
        for (const p of latest.players)
          if (!p.eliminated && p.id !== input.target)
            latest.votes[p.id] = input.target;
        this.save(latest);
        return json(publicState(latest));
      }
      if (url.pathname.endsWith("/dev/interrupt")) {
        const latest = this.read()!;
        latest.phase = "interrupted";
        latest.pending = [];
        latest.deadline = 0;
        this.save(latest);
        return json(publicState(latest));
      }
      if (url.pathname.endsWith("/dev/reflect")) {
        const latest = this.read()!;
        if (latest.phase !== "reveal")
          return json({ error: "Match must be finished" }, 409);
        await Promise.all(
          latest.players
            .filter((p) => p.agentId !== undefined)
            .map((p) => this.reflect(latest, p))
        );
        return json(publicState(this.read()!));
      }
      if (url.pathname.endsWith("/dev/reset")) {
        if (s.mode === "FIND_THE_AI")
          return json(
            { error: "Leave and matchmake a new multiplayer room." },
            409
          );
        for (const ws of this.ctx.getWebSockets()) ws.close(1012, "Room reset");
        this.ctx.storage.sql.exec("DELETE FROM room");
        await this.ctx.storage.deleteAlarm();
        await this.init(s.roomId, s.owner, input.fast === true);
        return json(publicState(this.read()!));
      }
      return json({ error: "Not found" }, 404);
    }
    const session = cookie(request),
      member = this.member(s, session);
    if (!session || !member)
      return json(
        { error: "This room belongs to another session. Start a new match." },
        403
      );
    if (url.pathname.endsWith("/leave") && request.method === "POST") {
      if (!["waiting", "starting"].includes(s.phase))
        return json(
          { error: "Match has begun. Reconnect to resume or spectate." },
          409
        );
      s.players = s.players.filter((p) => p.session !== session);
      s.phase = "waiting";
      s.startToken = undefined;
      s.deadline = 0;
      this.save(s);
      for (const ws of this.ctx.getWebSockets())
        if (ws.deserializeAttachment()?.session === session)
          ws.close(1000, "Left lobby");
      return json({ ok: true });
    }
    if (url.pathname.endsWith("/socket")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return json({ error: "WebSocket required" }, 426);
      if (
        this.ctx
          .getWebSockets()
          .filter((ws) => ws.deserializeAttachment()?.session === session)
          .length >= 3
      )
        return json({ error: "Too many open tabs for this match." }, 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.serializeAttachment({ session });
      this.ctx.acceptWebSocket(server);
      member.disconnectedAt = undefined;
      this.save(s);
      if (s.phase === "waiting") this.ctx.waitUntil(this.startWaiting());
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "GET")
      return json(publicState(s, Date.now(), session));
    return json({ error: "Not found" }, 404);
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    try {
      if (typeof raw !== "string" || raw.length > 2048)
        throw new Error("Invalid message");
      const action: ClientAction = JSON.parse(raw),
        s = this.read();
      if (!s) return;
      const self = this.member(
        s,
        ws.deserializeAttachment()?.session ?? s.owner
      );
      if (!self) throw new Error("No seat");
      let error: string | null;
      if (
        action.type === "message" &&
        typeof action.text === "string" &&
        typeof action.id === "string" &&
        /^[a-f0-9-]{36}$/.test(action.id)
      )
        error = addMessage(s, self.id, action.text, action.id, Date.now());
      else if (
        action.type === "vote" &&
        typeof action.target === "string" &&
        Number.isInteger(action.round)
      )
        error = castVote(s, self.id, action.target, action.round, Date.now());
      else throw new Error("Invalid action");
      if (error) ws.send(JSON.stringify({ type: "error", message: error }));
      else this.save(s);
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "That action could not be read."
        })
      );
    }
  }
  webSocketClose(ws: WebSocket, code: number) {
    this.disconnected(ws);
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }
  webSocketError(ws: WebSocket) {
    this.disconnected(ws);
    ws.close(1011, "Please reconnect");
  }
  disconnected(ws: WebSocket) {
    const s = this.read();
    if (!s) return;
    const session = ws.deserializeAttachment()?.session ?? s.owner;
    if (
      this.ctx
        .getWebSockets()
        .some(
          (other) =>
            other !== ws &&
            other.readyState === 1 &&
            other.deserializeAttachment()?.session === session
        )
    )
      return;
    const p = this.member(s, session);
    if (p) {
      p.disconnectedAt = Date.now();
      this.save(s);
    }
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/agents/"))
        return json({ error: "Not found" }, 404);
      if (url.pathname.startsWith("/api/")) {
        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin)
          return json({ error: "Origin not allowed" }, 403);
        if (url.pathname === "/api/dev/status" && devAllowed(request, env))
          return json({ fixture: true });
        if (url.pathname.startsWith("/api/admin/"))
          return adminApi(
            request,
            env,
            request.method === "POST" ? await body(request) : {}
          );
        if (url.pathname === "/api/rooms" && request.method === "POST") {
          const input = await body(request),
            owner = cookie(request) || crypto.randomUUID();
          if (
            input.mode !== undefined &&
            input.mode !== "BLEND_IN" &&
            input.mode !== "FIND_THE_AI"
          )
            return json({ error: "Unknown mode" }, 400);
          const fast = devAllowed(request, env) && input.fast === true;
          const id =
            input.mode === "FIND_THE_AI"
              ? await env.MATCHMAKER.getByName("waiting-rooms").join(
                  owner,
                  fast
                )
              : crypto.randomUUID();
          if (input.mode !== "FIND_THE_AI")
            await env.ROOMS.getByName(id).init(id, owner, fast);
          const response = json({ roomId: id }, 201);
          response.headers.set(
            "Set-Cookie",
            `human_session=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`
          );
          return response;
        }
        const match = url.pathname.match(
          /^\/api\/rooms\/([a-f0-9-]{36})(?:\/(socket|leave|dev\/(?:inspect|advance|reset|votes|interrupt|reflect|expire-disconnects)))?$/
        );
        if (match) return env.ROOMS.getByName(match[1]).fetch(request);
        return json({ error: "Not found" }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof RequestError)
        return json({ error: error.message }, error.status);
      console.error(
        JSON.stringify({
          event: "request_failed",
          path: url.pathname,
          error: String(error)
        })
      );
      return json(
        { error: "The room could not be reached. Please try again." },
        503
      );
    }
  }
} satisfies ExportedHandler<Env>;
