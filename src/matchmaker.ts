import { DurableObject } from "cloudflare:workers";

// Coordinates waiting seats only; gameplay and sockets never pass through here.
export class Matchmaker extends DurableObject<Env> {
  private joining = new Map<string, Promise<string>>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS queue (lane TEXT PRIMARY KEY, room TEXT NOT NULL)"
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS assignment (session TEXT PRIMARY KEY, room TEXT NOT NULL, expires INTEGER NOT NULL)"
    );
  }
  async join(session: string, fast = false): Promise<string> {
    const pending = this.joining.get(session);
    if (pending) return pending;
    const task = this.reserve(session, fast);
    this.joining.set(session, task);
    try {
      return await task;
    } finally {
      this.joining.delete(session);
    }
  }
  private async reserve(session: string, fast: boolean): Promise<string> {
    const sql = this.ctx.storage.sql;
    const old = sql
      .exec<{ room: string }>(
        "SELECT room FROM assignment WHERE session=? AND expires>?",
        session,
        Date.now()
      )
      .toArray()[0];
    if (old && (await this.env.ROOMS.getByName(old.room).hasSession(session)))
      return old.room;
    const lane = fast ? "test" : "normal";
    for (let attempt = 0; attempt < 12; attempt++) {
      // Reserve a queue pointer synchronously before calling another object.
      sql.exec("DELETE FROM assignment WHERE expires<?", Date.now());
      let room = sql
        .exec<{ room: string }>("SELECT room FROM queue WHERE lane=?", lane)
        .toArray()[0]?.room;
      if (!room) {
        room = crypto.randomUUID();
        sql.exec("INSERT INTO queue (lane,room) VALUES (?,?)", lane, room);
      }
      const accepted = await this.env.ROOMS.getByName(room).joinWaiting(
        room,
        session,
        fast
      );
      if (accepted) {
        sql.exec(
          "INSERT OR REPLACE INTO assignment VALUES (?,?,?)",
          session,
          room,
          Date.now() + 24 * 60 * 60 * 1000
        );
        return room;
      }
      sql.exec("DELETE FROM queue WHERE lane=? AND room=?", lane, room);
    }
    throw new Error("Matchmaking is busy. Please retry.");
  }
}
