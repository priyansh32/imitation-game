import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMessage,
  castVote,
  publicState,
  transition,
  type RoomState
} from "../src/game";
function room(): RoomState {
  return {
    roomId: "test",
    owner: "private-token",
    revision: 0,
    phase: "discussion",
    round: 1,
    maxRounds: 4,
    deadline: 999999,
    players: Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      name: ["moth", "chair", "pigeon", "rajma", "diesel", "helmet"][i],
      symbol: "◒",
      eliminated: false,
      ...(i ? { agentId: i } : {}),
      nextThink: 0,
      busyUntil: 0,
      lastSent: 0,
      suspicion: {},
      hypothesis: ""
    })),
    messages: [],
    votes: {},
    results: [],
    pending: [],
    durations: {
      arrival: 100,
      discussion: 10000,
      voting: 10000,
      elimination: 1000
    },
    reflection: {},
    reflectionBusy: {}
  };
}
test("public projection never contains private participant types, ownership, beliefs, scheduling or identity before reveal", () => {
  const s = room();
  for (const phase of [
    "arrival",
    "discussion",
    "voting",
    "elimination"
  ] as const) {
    s.phase = phase;
    const view = publicState(s);
    assert.deepEqual(Object.keys(view.participants[0]).sort(), [
      "eliminated",
      "id",
      "name",
      "symbol"
    ]);
    for (const key of [
      "owner",
      "agentId",
      "behavior",
      "suspicion",
      "hypothesis",
      "reflectionBusy",
      "identities",
      "isAI",
      "outcome"
    ])
      assert.ok(!JSON.stringify(view).includes(`"${key}"`), key);
  }
  s.phase = "reveal";
  assert.equal(
    publicState(s).identities?.filter((p) => p.kind === "human").length,
    1
  );
});
test("human and agent messages use identical schema, second precision, limit, rate gate, and idempotency", () => {
  const s = room();
  assert.equal(addMessage(s, "p0", " hello ", "a", 2000), null);
  assert.equal(addMessage(s, "p1", "hello", "b", 2345), null);
  assert.deepEqual(Object.keys(s.messages[0]), Object.keys(s.messages[1]));
  assert.equal(s.messages[1].at, 2000);
  assert.equal(s.messages[0].text, "hello");
  assert.equal(addMessage(s, "p0", "hello", "a", 2001), null);
  assert.equal(s.messages.length, 2);
  assert.ok(addMessage(s, "p0", "again", "c", 3000));
  assert.ok(addMessage(s, "p1", "x".repeat(281), "d", 5000));
  s.players[1].eliminated = true;
  assert.ok(addMessage(s, "p1", "boo", "e", 5000));
  assert.ok(addMessage(s, "p0", "late", "f", s.deadline));
});
test("votes reject self, eliminated and stale round targets; duplicate vote cannot be changed", () => {
  const s = room();
  transition(s, 2000);
  assert.ok(castVote(s, "p0", "p0", 1, 3000));
  assert.ok(castVote(s, "p0", "p1", 2, 3000));
  s.players[2].eliminated = true;
  assert.ok(castVote(s, "p0", "p2", 1, 3000));
  assert.equal(castVote(s, "p0", "p1", 1, 3000), null);
  assert.equal(castVote(s, "p0", "p1", 1, 3001), null);
  assert.ok(castVote(s, "p0", "p3", 1, 3002));
  assert.equal(Object.keys(s.votes).length, 1);
});
test("ties and zero-vote rounds always eliminate exactly one active candidate without disclosing type", () => {
  for (let i = 0; i < 20; i++) {
    const s = room();
    s.phase = "voting";
    transition(s, 2000);
    assert.equal(s.players.filter((p) => p.eliminated).length, 1);
    assert.equal(s.results[0].tied, true);
    assert.equal(s.results[0].abstentions, 6);
    assert.equal(publicState(s).identities, undefined);
  }
});
test("four concealed eliminations lead to human survival and final reveal", () => {
  const s = room();
  for (let r = 1; r <= 4; r++) {
    transition(s, r * 10000);
    assert.equal(s.phase, "voting");
    for (const p of s.players.filter((p) => !p.eliminated && p.id !== `p${r}`))
      s.votes[p.id] = `p${r}`;
    transition(s, r * 10000 + 100);
    assert.equal(s.results.at(-1)?.eliminated, `p${r}`);
    assert.equal(publicState(s).outcome, undefined);
    transition(s, r * 10000 + 200);
  }
  assert.equal(s.phase, "reveal");
  assert.equal(s.outcome, "blended");
  assert.equal(s.players.filter((p) => !p.eliminated).length, 2);
});
test("human elimination ends after the concealed verdict beat; pending responses are cancelled", () => {
  const s = room();
  s.phase = "voting";
  s.votes = { p1: "p0", p2: "p0", p3: "p0" };
  s.pending = [
    { sender: "p1", text: "stale", at: 3000, phase: "discussion", round: 1 }
  ];
  transition(s, 2000);
  assert.equal(s.phase, "elimination");
  assert.equal(s.outcome, "caught");
  assert.deepEqual(s.pending, []);
  transition(s, 3000);
  assert.equal(s.phase, "reveal");
  assert.equal(publicState(s).outcome, "caught");
});
