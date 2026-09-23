import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  Client,
  requireFixture,
  until
} from "../scripts/multiplayer-client.mjs";
await requireFixture();
const clients = [];
const make = () => {
  const c = new Client();
  clients.push(c);
  return c;
};
const checkPrivate = (s) => {
  if (s.phase === "reveal") return;
  for (const key of [
    "agentId",
    "session",
    "behavior",
    "beliefs",
    "hypothesis",
    "decisionTrace",
    "identities",
    "humanWon",
    "outcome",
    "kind",
    "startToken"
  ])
    assert.ok(!JSON.stringify(s).includes(`"${key}"`), key);
};
async function group() {
  const peers = Array.from({ length: 5 }, make);
  const ids = await Promise.all(peers.map((p) => p.join()));
  assert.equal(new Set(ids).size, 1);
  const before = await peers[0].inspect();
  assert.equal(before.room.phase, "waiting");
  assert.equal(before.room.players.length, 5);
  assert.equal(before.agents.length, 0);
  await Promise.all(peers.map((p) => p.connect()));
  await until(
    () => peers.every((p) => p.state.phase === "arrival"),
    "five sockets start"
  );
  assert.equal(new Set(peers.map((p) => p.state.selfId)).size, 5);
  const hidden = await peers[0].inspect();
  assert.equal(hidden.room.players.length, 6);
  assert.equal(hidden.agents.length, 1);
  await peers[0].advance();
  await until(
    () => peers.every((p) => p.state.phase === "discussion"),
    "discussion"
  );
  return {
    peers,
    ai: hidden.room.players.find((p) => p.agentId !== undefined),
    agent: hidden.agents[0]
  };
}
async function round(peers, target) {
  await peers[0].advance();
  await until(() => peers[0].state.phase === "voting", "voting");
  if (peers[0].state.participants.filter((p) => !p.eliminated).length === 3) {
    // With two humans left, coordinate around the AI's independently cast ballot.
    target = await until(
      async () => {
        const { room } = await peers[0].inspect();
        const ai = room.players.find((p) => p.agentId !== undefined);
        return room.votes[ai.id];
      },
      "final independent agent vote",
      18000
    );
  }
  await Promise.all(
    peers.map(async (p) => {
      if (p.state.participants.find((q) => q.id === p.state.selfId).eliminated)
        return;
      const choice =
        p.state.selfId === target
          ? p.state.participants.find((q) => !q.eliminated && q.id !== target)
              .id
          : target;
      p.send({ type: "vote", target: choice, round: p.state.round });
      await until(() => p.state.votedFor === choice, "own vote");
    })
  );
  if (peers[0].state.phase === "voting") await peers[0].advance();
  await until(
    () => peers.every((p) => p.state.phase === "elimination"),
    "elimination"
  );
  assert.equal(peers[0].state.results.at(-1).eliminated, target);
  for (const p of peers) checkPrivate(p.state);
  await peers[0].advance();
}
try {
  // Lobby close drops count immediately, explicit leave frees a slot; never starts early.
  const first = make();
  await first.join();
  await first.connect();
  assert.equal(first.state.phase, "waiting");
  assert.equal(first.state.lobby.joined, 1);
  assert.deepEqual(first.state.participants, []);
  const reentries = await Promise.all([
    first.request("/api/rooms", { mode: "FIND_THE_AI" }),
    first.request("/api/rooms", { mode: "FIND_THE_AI" })
  ]);
  for (const response of reentries)
    assert.equal((await response.json()).roomId, first.room);
  const otherTab = make();
  otherTab.cookie = first.cookie;
  otherTab.room = first.room;
  await otherTab.connect();
  await otherTab.disconnect();
  assert.equal((await first.inspect()).room.players.length, 1);
  assert.equal(first.state.lobby.joined, 1);
  const second = make();
  assert.equal(await second.join(), first.room);
  await second.connect();
  await until(() => first.state.lobby.joined === 2, "second connected");
  await second.disconnect();
  await until(() => first.state.lobby.joined === 1, "disconnect count");
  await second.connect();
  await until(() => first.state.lobby.joined === 2, "lobby reconnect");
  await second.leave();
  await first.leave();

  // Six concurrent requests fill exactly five seats; sixth gets another room.
  const racers = Array.from({ length: 6 }, make);
  await Promise.all(racers.map((c) => c.join()));
  const counts = Object.values(
    racers.reduce((a, c) => ((a[c.room] = (a[c.room] ?? 0) + 1), a), {})
  ).sort();
  assert.deepEqual(counts, [1, 5]);
  for (const c of racers) await c.leave();

  const { peers, ai, agent } = await group();
  const self = peers[0].state.selfId;
  const sentId = randomUUID();
  peers[0].send({
    type: "message",
    text: "Why is everyone so confident already?",
    id: sentId
  });
  peers[0].send({ type: "message", text: "duplicate", id: sentId });
  peers[1].send({
    type: "message",
    text: "I want to hear a reason before we vote.",
    id: randomUUID()
  });
  await until(
    () => peers.every((p) => p.state.messages.some((m) => m.id === sentId)),
    "broadcast to all humans"
  );
  assert.equal(
    peers[0].state.messages.filter((m) => m.id === sentId).length,
    1
  );
  const beforeId = peers[0].state.selfId;
  await peers[0].disconnect();
  await peers[0].connect();
  assert.equal(peers[0].state.selfId, beforeId);
  peers[0].send({ type: "message", text: "x".repeat(281), id: randomUUID() });
  await until(() => peers[0].errors.length > 0, "length validation");
  // Wait for a genuine fixture-agent decision through the same scheduler and message path.
  await until(
    () => peers[0].state.messages.some((m) => m.sender === ai.id),
    "agent contribution",
    55000
  );
  const aiMessage = peers[0].state.messages.find((m) => m.sender === ai.id);
  assert.deepEqual(
    Object.keys(aiMessage).sort(),
    Object.keys(peers[0].state.messages.find((m) => m.id === sentId)).sort()
  );
  console.log(
    "Conversation:",
    peers[0].state.messages
      .map(
        (m) =>
          `${peers[0].state.participants.find((p) => p.id === m.sender).name}: ${m.text}`
      )
      .join("\n")
  );
  await round(peers, self);
  await until(() => peers[0].state.phase === "discussion", "second round");
  const oldCount = peers[0].state.messages.length;
  peers[0].send({
    type: "message",
    text: "spectator cannot speak",
    id: randomUUID()
  });
  await until(
    () => peers[0].errors.some((e) => e.includes("Discussion")),
    "eliminated chat blocked"
  );
  assert.equal(peers[0].state.messages.length, oldCount);
  // A human victory is collective, including eliminated spectators.
  await round(peers, ai.id);
  await until(
    () => peers.every((p) => p.state.phase === "reveal"),
    "reveal broadcast"
  );
  assert.equal(peers[0].state.humanWon, true);
  assert.equal(
    peers[0].state.identities.filter((p) => p.kind === "human").length,
    5
  );
  await until(
    async () => (await peers[0].inspect()).agents[0].games === agent.games + 1,
    "experience counted"
  );
  const final = await peers[0].inspect();
  assert.equal(final.experiences[0].mode, "FIND_THE_AI");
  assert.equal(final.experiences[0].role, "INFILTRATOR");
  assert.equal(final.experiences[0].eliminationRound, 2);
  assert.ok(final.experiences[0].conversation.length >= 3);
  assert.equal(final.agents[0].agentId, agent.agentId);
  assert.deepEqual(final.agents[0].temperament, agent.temperament);
  for (const p of peers)
    for (const packet of p.packets)
      if (packet.type === "state") checkPrivate(packet.state);

  const survival = await group();
  for (let r = 0; r < 4; r++) {
    const target = survival.peers[0].state.participants.find(
      (p) => p.id !== survival.ai.id && !p.eliminated
    ).id;
    await round(survival.peers, target);
    await until(
      () =>
        survival.peers[0].state.phase === (r === 3 ? "reveal" : "discussion"),
      "next phase"
    );
  }
  assert.equal(survival.peers[0].state.humanWon, false);
  const publicResult = survival.peers[0].state;
  assert.equal(
    publicResult.identities.find((i) => i.id === survival.ai.id).agentId,
    survival.agent.agentId
  );
  await until(
    async () => !!(await survival.peers[0].inspect()).experiences[0],
    "survival experience"
  );
  const survivalFinal = await survival.peers[0].inspect();
  assert.equal(survivalFinal.experiences[0].eliminationRound, null);

  const disconnected = await group();
  const absentId = disconnected.peers[4].state.selfId;
  await disconnected.peers[4].disconnect();
  await until(
    async () =>
      (await disconnected.peers[0].inspect()).room.players.find(
        (p) => p.id === absentId
      ).disconnectedAt,
    "disconnect recorded"
  );
  await disconnected.peers[0].request(
    `/api/rooms/${disconnected.peers[0].room}/dev/expire-disconnects`,
    {},
    { "X-Dev-Token": "local-inspection-only" }
  );
  await until(
    () =>
      disconnected.peers[0].state.participants.find((p) => p.id === absentId)
        .eliminated,
    "disconnect forfeit"
  );
  await disconnected.peers[4].connect();
  assert.equal(disconnected.peers[4].state.selfId, absentId);
  assert.equal(
    disconnected.peers[4].state.participants.find((p) => p.id === absentId)
      .eliminated,
    true
  );
  await disconnected.peers[0].request(
    `/api/rooms/${disconnected.peers[0].room}/dev/interrupt`,
    {},
    { "X-Dev-Token": "local-inspection-only" }
  );

  // Sample the shared pool normally until the same identity appears in Blend In.
  let crossMode;
  for (let attempt = 0; attempt < 40 && !crossMode; attempt++) {
    const blend = make();
    await blend.join("BLEND_IN");
    const inspected = await blend.inspect();
    if (inspected.agents.some((p) => p.agentId === agent.agentId)) {
      await blend.connect();
      if (blend.state.phase === "arrival") await blend.advance();
      await until(
        () => blend.state.phase === "discussion",
        "shared agent Blend discussion"
      );
      await blend.advance();
      await blend.request(
        `/api/rooms/${blend.room}/dev/votes`,
        { target: blend.state.selfId },
        { "X-Dev-Token": "local-inspection-only" }
      );
      await blend.advance();
      await blend.advance();
      crossMode = await until(async () => {
        const proof = await blend.inspect();
        const index = proof.agents.findIndex(
          (p) => p.agentId === agent.agentId
        );
        return (
          proof.experiences[index] && {
            agent: proof.agents[index],
            experience: proof.experiences[index]
          }
        );
      }, "same persistent agent hunter experience");
    } else
      await blend.request(
        `/api/rooms/${blend.room}/dev/interrupt`,
        {},
        { "X-Dev-Token": "local-inspection-only" }
      );
  }
  assert.ok(crossMode);
  assert.equal(crossMode.experience.role, "HUNTER");
  assert.equal(crossMode.experience.mode, "BLEND_IN");
  assert.deepEqual(crossMode.agent.temperament, agent.temperament);
  assert.ok(
    crossMode.agent.history.some(
      (h) => h.mode === "FIND_THE_AI" && h.role === "INFILTRATOR"
    )
  );
  assert.ok(crossMode.agent.history.every((h) => h.mode && h.role));

  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/multiplayer-proof.json",
    JSON.stringify(
      {
        humanWin: final.experiences[0],
        aiWin: survivalFinal.experiences[0],
        crossMode,
        tests: [
          "lobby",
          "concurrent six joins",
          "five independent sessions",
          "reconnect",
          "private serialization",
          "broadcast",
          "duplicate and invalid messages",
          "agent scheduler",
          "multi-round voting",
          "eliminated spectator",
          "both outcomes",
          "cross-mode agent storage and personality",
          "experience history"
        ]
      },
      null,
      2
    )
  );
  console.log(
    "PASS: complete Find the AI games, both outcomes, private sessions, multiplayer voting, agent history."
  );
} finally {
  await Promise.all(clients.map((c) => c.disconnect()));
}
