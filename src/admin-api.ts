import { getAgentByName } from "agents";
import { POPULATION } from "./game";
import { MODES } from "./modes";
import { MODELS, isModel } from "./models";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function digest(text: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
}
async function token(env: Env) {
  return Array.from(await digest("human-admin:" + env.ADMIN_TOKEN), (n) =>
    n.toString(16).padStart(2, "0")
  ).join("");
}
async function equal(a: string, b: string) {
  const aa = await digest(a),
    bb = await digest(b);
  if (aa.length !== bb.length) return false;
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
export async function adminAllowed(request: Request, env: Env) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(request.url).hostname
  );
  if (local && String(env.LOCAL_ADMIN) === "true") return true;
  if (!env.ADMIN_TOKEN) return false;
  const presented =
    request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)human_admin=([a-f0-9]{64})/)?.[1] ?? "";
  return equal(presented, await token(env));
}
export async function adminApi(
  request: Request,
  env: Env,
  input: Record<string, unknown>
) {
  const url = new URL(request.url);
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    if (
      !env.ADMIN_TOKEN ||
      typeof input.token !== "string" ||
      !(await equal(input.token, env.ADMIN_TOKEN))
    )
      return json({ error: "Incorrect administrator key." }, 401);
    const response = json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `human_admin=${await token(env)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${url.protocol === "https:" ? "; Secure" : ""}`
    );
    return response;
  }
  if (!(await adminAllowed(request, env)))
    return json({ error: "Administrator access required." }, 401);
  if (url.pathname === "/api/admin/population" && request.method === "GET") {
    const agents = await Promise.all(
      POPULATION.map(async (id) =>
        (await getAgentByName(env.PLAYERS, `player-${id}`)).profile(id)
      )
    );
    return json({
      agents,
      models: MODELS,
      fixture: String(env.DEVELOPMENT) === "true",
      agentSeats: Object.fromEntries(
        Object.entries(MODES).map(([mode, rules]) => [mode, rules.agents])
      )
    });
  }
  const match = url.pathname.match(
    /^\/api\/admin\/agents\/(\d+)\/(model|probe)$/
  );
  if (
    match &&
    request.method === "POST" &&
    POPULATION.includes(Number(match[1]))
  ) {
    const id = Number(match[1]),
      stub = await getAgentByName(env.PLAYERS, `player-${id}`);
    if (match[2] === "probe") return json(await stub.probe(id));
    if (!isModel(input.model))
      return json({ error: "Choose a supported model." }, 400);
    return json(await stub.configureModel(id, input.model));
  }
  return json({ error: "Not found" }, 404);
}
