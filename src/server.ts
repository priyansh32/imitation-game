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
  type PrivatePlayer,
  type RoomState
} from "./game";
import type { ClientAction } from "./shared";
import { adminApi } from './admin-api';
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
      const data = JSON.stringify({ type: "state", state: publicState(s) });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(data);
        } catch {
          socket.close(1011, "Reconnect");
        }
      }
    }
  }
  async init(roomId: string, owner: string, fast = false) {
    if (this.read()) return;
    const ids = shuffle(POPULATION).slice(0, 5);
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
      behavior: profiles.find((p) => p.agentId === agentId)?.behavior,
      nextThink: now,
      busyUntil: 0,
      lastSent: 0,
      suspicion: {},
      hypothesis: ""
    }));
    const durations = fast
      ? { arrival: 1200, discussion: 8000, voting: 6000, elimination: 1800 }
      : { arrival: 4500, discussion: 65000, voting: 18000, elimination: 5500 };
    const s: RoomState = {
      roomId,
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
      reflectionBusy: {}
    };
    this.save(s);
    await this.ctx.storage.setAlarm(now + 500);
  }
  observe(s: RoomState, p: PrivatePlayer): Observation {
    return {
      self: p.id,
      participants: publicState(s).participants,
      messages: s.messages.slice(-60),
      results: s.results,
      phase: s.phase === "voting" ? "voting" : "discussion",
      round: s.round,
      suspicion: p.suspicion,
      hypothesis: p.hypothesis
      , ownVotes: Object.entries(s.ballots ?? {}).filter(([, votes]) => votes[p.id]).map(([round, votes]) => ({ round: Number(round), target: votes[p.id] }))
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
      p.hypothesis = decision.hypothesis;
      const delay = behaviorDelay(p.behavior!);
      p.nextThink = now + delay + 4000 + Math.random() * 7000;
      if (s.phase === "voting" && decision.target) {
        s.pending.push({
          sender: p.id,
          target: decision.target,
          at: Math.min(s.deadline - 250, now + delay),
          round: s.round,
          phase: s.phase
        });
      } else if (decision.intent !== "silent" && decision.text.trim()) {
        s.pending.push({
          sender: p.id,
          text: decision.text,
          at: now + delay,
          round: s.round,
          phase: s.phase
        });
        if (
          decision.followUp &&
          Math.random() < p.behavior!.doubleTextFrequency
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
        snapshot.outcome!
      );
      const recorded = this.read();
      if (!recorded || recorded.finishedAt !== snapshot.finishedAt) return;
      recorded.reflection[original.id].games = receipt.games;
      this.save(recorded);
      const result = await stub.reflect(original.agentId!, snapshot.roomId, {
        observation: this.observe(snapshot, original),
        humanId: snapshot.players.find((p) => p.agentId === undefined)!.id,
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
      for (const p of s.players) {
        if (
          p.agentId === undefined ||
          p.eliminated ||
          p.busyUntil > now ||
          p.nextThink > now ||
          s.pending.some((a) => a.sender === p.id)
        )
          continue;
        if (s.phase === "voting" && s.votes[p.id]) continue;
        p.nextThink = now + behaviorDelay(p.behavior!);
        if (
          s.phase === "discussion" &&
          ((p.decisions ?? 0) >= 4 ||
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
      return json({ room: s, agents });
    }
    if (url.pathname.includes("/dev/")) {
      if (!devAllowed(request, this.env))
        return json({ error: "Not found" }, 404);
      if (request.method !== "POST")
        return json({ error: "Method not allowed" }, 405);
      const input = await body(request);
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
        for (const ws of this.ctx.getWebSockets()) ws.close(1012, "Room reset");
        this.ctx.storage.sql.exec("DELETE FROM room");
        await this.ctx.storage.deleteAlarm();
        await this.init(s.roomId, s.owner, input.fast === true);
        return json(publicState(this.read()!));
      }
      return json({ error: "Not found" }, 404);
    }
    if (!cookie(request) || cookie(request) !== s.owner)
      return json(
        { error: "This room belongs to another session. Start a new match." },
        403
      );
    if (url.pathname.endsWith("/socket")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return json({ error: "WebSocket required" }, 426);
      if (this.ctx.getWebSockets().length >= 6)
        return json({ error: "Too many open tabs for this match." }, 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "state", state: publicState(s) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "GET") return json(publicState(s));
    return json({ error: "Not found" }, 404);
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    try {
      if (typeof raw !== "string" || raw.length > 2048)
        throw new Error("Invalid message");
      const action: ClientAction = JSON.parse(raw),
        s = this.read();
      if (!s) return;
      const self = s.players.find((p) => p.agentId === undefined)!;
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
    ws.close(code === 1006 ? 1000 : code);
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "Please reconnect");
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
        if (url.pathname.startsWith('/api/admin/')) return adminApi(request, env, request.method === 'POST' ? await body(request) : {});
        if (url.pathname === "/api/rooms" && request.method === "POST") {
          const input = await body(request),
            id = crypto.randomUUID(),
            owner = cookie(request) || crypto.randomUUID();
          await env.ROOMS.getByName(id).init(
            id,
            owner,
            devAllowed(request, env) && input.fast === true
          );
          const response = json({ roomId: id }, 201);
          response.headers.set(
            "Set-Cookie",
            `human_session=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`
          );
          return response;
        }
        const match = url.pathname.match(
          /^\/api\/rooms\/([a-f0-9-]{36})(?:\/(socket|dev\/(?:inspect|advance|reset|votes|interrupt|reflect)))?$/
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
