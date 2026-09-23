import WebSocket from "ws";
import assert from "node:assert/strict";
export const base = process.env.TEST_URL || "http://127.0.0.1:5180";
export const dev = { "X-Dev-Token": "local-inspection-only" };
export async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${label}`);
}
export async function requireFixture() {
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "Simulation is local only"
  );
  const response = await fetch(base + "/api/dev/status", { headers: dev });
  assert.equal(
    response.status,
    200,
    "Start npm run dev:local first. Simulation cannot use production."
  );
  assert.equal((await response.json()).fixture, true);
  console.log(
    "LOCAL SIMULATION: all five human seats below are automated test clients."
  );
}
export class Client {
  cookie = "";
  room = "";
  packets = [];
  state = null;
  errors = [];
  ws = null;
  async request(path, data, headers = {}) {
    return fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Cookie: this.cookie,
        Origin: base,
        "Content-Type": "application/json",
        ...headers
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
  }
  async join(mode = "FIND_THE_AI", fast = false) {
    const r = await this.request("/api/rooms", { mode, fast }, dev);
    assert.equal(r.status, 201, await r.clone().text());
    this.cookie = r.headers.get("set-cookie").split(";")[0];
    this.room = (await r.json()).roomId;
    return this.room;
  }
  async connect() {
    this.state = null;
    const ws = new WebSocket(
      base.replace(/^http/, "ws") + `/api/rooms/${this.room}/socket`,
      { headers: { Cookie: this.cookie, Origin: base } }
    );
    this.ws = ws;
    ws.on("message", (data) => {
      const packet = JSON.parse(String(data));
      this.packets.push(packet);
      if (packet.type === "state") this.state = packet.state;
      else this.errors.push(packet.message);
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await until(() => this.state, "socket snapshot");
  }
  send(action) {
    this.ws.send(JSON.stringify(action));
  }
  async disconnect() {
    const ws = this.ws;
    this.ws = null;
    if (!ws || ws.readyState === 3) return;
    await new Promise((resolve) => {
      ws.once("close", resolve);
      ws.close();
    });
  }
  async leave() {
    await this.request(`/api/rooms/${this.room}/leave`, {});
    await this.disconnect();
  }
  async inspect() {
    const r = await this.request(
      `/api/rooms/${this.room}/dev/inspect`,
      undefined,
      dev
    );
    assert.equal(r.status, 200);
    return r.json();
  }
  async advance() {
    const r = await this.request(
      `/api/rooms/${this.room}/dev/advance`,
      {},
      dev
    );
    assert.equal(r.status, 200);
    return r.json();
  }
}
