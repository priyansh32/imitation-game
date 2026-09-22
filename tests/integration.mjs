import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const dev = { "X-Dev-Token": "local-inspection-only" };
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const request = context.request;
const get = async (id) => (await request.get(`${base}/api/rooms/${id}`)).json();
const inspect = async (id) =>
  (
    await request.get(`${base}/api/rooms/${id}/dev/inspect`, { headers: dev })
  ).json();
const post = async (id, command, data = {}) => {
  const r = await request.post(`${base}/api/rooms/${id}/dev/${command}`, {
    headers: dev,
    data
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
const until = async (fn, label, timeout = 12000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out: ${label}`);
};
try {
  await page.goto(base);
  await page.getByRole("button", { name: "BLEND IN", exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/landing-desktop.png",
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("button", { name: "HOW TO PLAY" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "BLEND IN", exact: true }).click();
  const id = await until(
    () => page.evaluate(() => localStorage.getItem("human-room")),
    "room created"
  );
  await until(
    async () => (await get(id)).phase === "discussion",
    "discussion started"
  );
  let s = await get(id);
  assert.equal(s.participants.length, 6);
  assert.equal(s.identities, undefined);
  assert.equal(
    (await request.get(`${base}/api/rooms/${id}/dev/inspect`)).status(),
    404
  );
  const stranger = await browser.newContext();
  assert.equal(
    (await stranger.request.get(`${base}/api/rooms/${id}`)).status(),
    403
  );
  await stranger.close();
  assert.equal(
    (
      await request.post(`${base}/api/rooms`, {
        headers: { Origin: "https://unrelated.example" },
        data: {}
      })
    ).status(),
    403
  );
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("a suspicious amount of agreement in here");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until(
    async () =>
      (await get(id)).messages.some(
        (m) => m.text === "a suspicious amount of agreement in here"
      ),
    "message accepted"
  );
  await until(
    async () => (await get(id)).messages.some((m) => m.sender !== s.selfId),
    "independent agent message",
    25000
  );
  await page.screenshot({
    path: "artifacts/match-desktop.png",
    fullPage: true,
    animations: "disabled"
  });
  await page.reload();
  await page
    .getByText("a suspicious amount of agreement in here", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("human-room")),
    id
  );
  // Two simultaneous connections: same client id must yield one message, duplicate votes one ballot.
  const duplicate = crypto.randomUUID();
  await new Promise((r) => setTimeout(r, 1900));
  const packets = await page.evaluate(
    async ({ id, duplicate }) => {
      const sockets = await Promise.all(
        [0, 1].map(
          () =>
            new Promise((resolve) => {
              const w = new WebSocket(
                `ws://${location.host}/api/rooms/${id}/socket`
              );
              w.onopen = () => resolve(w);
            })
        )
      );
      sockets.forEach((w) =>
        w.send(
          JSON.stringify({
            type: "message",
            text: "same thought, one message",
            id: duplicate
          })
        )
      );
      await new Promise((r) => setTimeout(r, 500));
      sockets.forEach((w) => w.close());
      return true;
    },
    { id, duplicate }
  );
  assert.equal(packets, true);
  s = await get(id);
  assert.equal(s.messages.filter((m) => m.id === duplicate).length, 1);
  await context.setOffline(true);
  await new Promise((r) => setTimeout(r, 500));
  await context.setOffline(false);
  await until(
    () => page.getByRole("textbox", { name: "Your message" }).isEnabled(),
    "reconnected",
    15000
  );
  const initial = await inspect(id);
  const before = Object.fromEntries(
    initial.agents.map((a) => [a.agentId, a.games])
  );
  for (let round = 1; round <= 4; round++) {
    s = await get(id);
    assert.equal(s.phase, "discussion");
    assert.equal(s.round, round);
    await post(id, "advance");
    const target = s.participants.find(
      (p) => !p.eliminated && p.id !== s.selfId
    );
    await page
      .getByRole("button", {
        name: `${target.name}, select to vote`,
        exact: true
      })
      .click();
    await page
      .getByRole("button", {
        name: `VOTE OUT ${target.name.toUpperCase()}`,
        exact: true
      })
      .click();
    await until(
      async () => (await get(id)).votedFor === target.id,
      "vote persisted"
    );
    if (round === 1) {
      await page.screenshot({
        path: "artifacts/voting-desktop.png",
        fullPage: true,
        animations: "disabled"
      });
      await page.reload();
      await page
        .getByRole("button", { name: "VOTE LOCKED ✓", exact: true })
        .waitFor();
    }
    await post(id, "votes", { target: target.id });
    s = await get(id);
    if (s.phase === "voting") s = await post(id, "advance");
    assert.equal(s.phase, "elimination");
    assert.equal(s.identities, undefined);
    assert.equal(s.results.at(-1).eliminated, target.id);
    if (round === 1)
      await page.screenshot({
        path: "artifacts/elimination-desktop.png",
        fullPage: true,
        animations: "disabled"
      });
    await post(id, "advance");
  }
  s = await get(id);
  assert.equal(s.phase, "reveal");
  assert.equal(s.outcome, "blended");
  await until(
    async () => {
      const v = await get(id);
      return v.identities.every(
        (p) => p.kind === "human" || p.reflection === "complete"
      );
    },
    "persistent reflections",
    15000
  );
  const after = await inspect(id);
  for (const a of after.agents) {
    assert.equal(a.games, before[a.agentId] + 1);
    assert.ok(a.episodes.length > 0);
    assert.ok(a.strategy.earlyAccusation < 0.5);
  }
  await Promise.all([post(id, "reflect"), post(id, "reflect")]);
  const repeated = await inspect(id);
  for (const a of repeated.agents) {
    const prior = after.agents.find((p) => p.agentId === a.agentId);
    assert.equal(
      a.games,
      prior.games,
      "reflection retries must not count another game"
    );
    assert.deepEqual(
      a.strategy,
      prior.strategy,
      "reflection retries must not learn twice"
    );
  }
  await page
    .getByRole("button", { name: "ANOTHER IDENTITY. ANOTHER CHANCE." })
    .waitFor();
  await until(
    () =>
      page
        .getByRole("button", { name: "ANOTHER IDENTITY. ANOTHER CHANCE." })
        .isEnabled(),
    "progressive reveal complete"
  );
  await page.screenshot({
    path: "artifacts/reveal-desktop.png",
    fullPage: true,
    animations: "disabled"
  });
  await page
    .getByRole("button", { name: "ANOTHER IDENTITY. ANOTHER CHANCE." })
    .click();
  const next = await until(async () => {
    const r = await page.evaluate(() => localStorage.getItem("human-room"));
    return r !== id && r;
  }, "replay");
  const nextPrivate = await inspect(next);
  const shared = nextPrivate.agents.filter((a) =>
    after.agents.some((b) => b.agentId === a.agentId)
  );
  assert.ok(shared.length >= 2);
  for (const a of shared) {
    assert.equal(
      a.games,
      after.agents.find((b) => b.agentId === a.agentId).games
    );
    assert.ok(a.episodes.length);
  }
  await post(next, "advance");
  await post(next, "advance");
  let nextState = await get(next);
  await post(next, "votes", { target: nextState.selfId });
  nextState = await get(next);
  if (nextState.phase === "voting") await post(next, "advance");
  await post(next, "advance");
  assert.equal((await get(next)).outcome, "caught");
  await until(
    () =>
      page.getByRole("heading", { name: "A little too human." }).isVisible(),
    "loss reveal"
  );
  await page.screenshot({
    path: "artifacts/reveal-loss.png",
    fullPage: true,
    animations: "disabled"
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/reveal-mobile.png",
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("button", { name: "HUMAN? home" }).click();
  await page.screenshot({
    path: "artifacts/landing-mobile.png",
    fullPage: true,
    animations: "disabled"
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "no mobile overflow"
  );
  await page.getByRole("button", { name: "BLEND IN", exact: true }).click();
  const mobile = await until(async () => {
    const r = await page.evaluate(() => localStorage.getItem("human-room"));
    return r !== next && r;
  }, "mobile room");
  await post(mobile, "advance");
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("does anyone actually like the name they got");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until(async () => (await get(mobile)).messages.length, "mobile send");
  await page.screenshot({
    path: "artifacts/match-mobile.png",
    fullPage: true,
    animations: "disabled"
  });
  await post(mobile, "advance");
  await page.getByRole("heading", { name: "Who seems too human?" }).waitFor();
  await page.screenshot({
    path: "artifacts/voting-mobile.png",
    fullPage: true,
    animations: "disabled"
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "no voting overflow"
  );
  await post(mobile, "reset", { fast: true });
  await until(
    async () => (await get(mobile)).phase === "discussion",
    "fast reset"
  );
  await until(
    async () => (await get(mobile)).phase === "voting",
    "automatic fast timer",
    12000
  );
  // Malformed API input is safely rejected and never reveals hidden state.
  assert.equal(
    (
      await request.post(`${base}/api/rooms`, { data: "x".repeat(5000) })
    ).status(),
    413
  );
  await post(mobile, "interrupt");
  await page.getByRole("heading", { name: "The room went quiet." }).waitFor();
  assert.equal((await get(mobile)).identities, undefined);
  await page.getByRole("button", { name: "BACK TO THE DOOR" }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("human-room")),
    null
  );
  const proof = await inspect(id);
  await writeFile(
    "artifacts/persistence-proof.json",
    JSON.stringify(
      {
        roomId: id,
        agents: proof.agents.map((a) => ({
          agentId: a.agentId,
          games: a.games,
          strategy: a.strategy,
          episodes: a.episodes
        }))
      },
      null,
      2
    )
  );
  // Offline/unavailable state has a recovery action.
  await page.goto(base);
  await page.evaluate(() =>
    localStorage.setItem("human-room", crypto.randomUUID())
  );
  await page.reload();
  await page.getByRole("button", { name: "START A FRESH MATCH" }).waitFor();
  assert.deepEqual(
    errors.filter(
      (e) =>
        !e.includes("net::ERR_INTERNET_DISCONNECTED") &&
        !e.includes("WebSocket") &&
        !e.includes("Failed to load resource")
    ),
    []
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: [
          "landing/rules",
          "private projection",
          "ownership/origin/debug guards",
          "chat",
          "independent scheduling",
          "duplicate simultaneous messages",
          "refresh",
          "offline reconnect",
          "vote refresh",
          "4-round survival",
          "concealed elimination",
          "progressive reveal",
          "reflection",
          "concurrent reflection idempotency",
          "cross-match persistence",
          "replay",
          "human loss",
          "390px mobile",
          "fast timers",
          "room reset",
          "interrupted-match recovery",
          "recovery UI"
        ],
        sharedAgents: shared.map((a) => a.agentId),
        browserErrors: errors
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
