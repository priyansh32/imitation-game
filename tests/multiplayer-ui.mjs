import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import {
  Client,
  base,
  dev,
  requireFixture,
  until
} from "../scripts/multiplayer-client.mjs";

await requireFixture();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const errors = [];
const peers = Array.from({ length: 4 }, () => new Client());
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
let room;
const get = async () =>
  (await context.request.get(`${base}/api/rooms/${room}`)).json();
const control = async (command, data = {}) => {
  const response = await context.request.post(
    `${base}/api/rooms/${room}/dev/${command}`,
    { headers: dev, data }
  );
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
const picture = async (name) => {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "no horizontal overflow"
  );
  await page.screenshot({
    path: `artifacts/find-${name}.png`,
    fullPage: true,
    animations: "disabled"
  });
};
try {
  await page.goto(base);
  await page.getByRole("button", { name: "FIND A GAME" }).click();
  await page.getByRole("heading", { name: "Finding humans…" }).waitFor();
  room = await page.evaluate(() => localStorage.getItem("human-room"));
  await picture("lobby-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await picture("lobby-mobile");
  await page.reload();
  await page.getByText("1 / 5 PLAYERS JOINED").waitFor();
  await Promise.all(
    peers.map(async (p) => {
      assert.equal(await p.join(), room);
      await p.connect();
    })
  );
  await until(
    async () => (await get()).phase === "arrival",
    "browser room ready"
  );
  await control("advance");
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("i am going to need more than a vibe to vote");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until(
    () =>
      peers.every((p) =>
        p.state.messages.some((m) => m.text.includes("more than a vibe"))
      ),
    "browser broadcast"
  );
  await picture("match-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await picture("match-desktop");
  const self = (await get()).selfId;
  await page.reload();
  await page.getByRole("textbox", { name: "Your message" }).waitFor();
  assert.equal((await get()).selfId, self);
  await control("advance");
  await page.getByRole("heading", { name: "Who seems artificial?" }).waitFor();
  await picture("voting-desktop");
  await control("votes", { target: self });
  if ((await get()).phase === "voting") await control("advance");
  await control("advance");
  await page.getByText("YOU WERE ELIMINATED").waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Your message" }).isDisabled(),
    true
  );
  await picture("spectating-desktop");
  await control("advance");
  await page.getByText("YOU WERE ELIMINATED").waitFor();
  assert.equal(
    await page.getByRole("button", { name: /LOCK VOTE/ }).count(),
    0
  );
  const hidden = await (
    await context.request.get(`${base}/api/rooms/${room}/dev/inspect`, {
      headers: dev
    })
  ).json();
  await control("votes", {
    target: hidden.room.players.find((p) => p.agentId !== undefined).id
  });
  if ((await get()).phase === "voting") await control("advance");
  await control("advance");
  await page.getByRole("heading", { name: "You found it." }).waitFor();
  await picture("reveal-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await picture("reveal-mobile");
  await page
    .getByRole("button", { name: "ANOTHER IDENTITY. ANOTHER CHANCE." })
    .click();
  await page.getByRole("heading", { name: "Finding humans…" }).waitFor();
  await page.getByRole("button", { name: "LEAVE LOBBY" }).click();
  await page.getByRole("button", { name: "FIND A GAME" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile lobby, browser chat, refresh, eliminated spectator, voting, progressive reveal, replay and leave; no browser errors."
  );
} finally {
  await Promise.all(peers.map((p) => p.disconnect()));
  await browser.close();
}
