import { useEffect, useMemo, useState } from "react";
import "./admin.css";
type Model = { id: string; label: string; family: string; description: string };
type Agent = {
  agentId: number;
  model: string;
  games: number;
  wins: number;
  temperament: Record<string, number>;
  behavior: Record<string, number>;
  strategy: Record<string, number>;
  episodes: { room: string; lesson: string; at: number; source?: string }[];
  lastInference?: { at: number; status: string; detail: string };
};
const pretty = (value: string) =>
  value.replace(/[A-Z]/g, (m) => ` ${m}`).replace(/^./, (m) => m.toUpperCase());
const api = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
};
export default function Admin() {
  const [agents, setAgents] = useState<Agent[]>([]),
    [models, setModels] = useState<Model[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [filter, setFilter] = useState("all"),
    [token, setToken] = useState(""),
    [needsLogin, setNeedsLogin] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const data = (await api("/api/admin/population")) as {
        agents: Agent[];
        models: Model[];
      };
      setAgents(data.agents);
      setModels(data.models);
      setNeedsLogin(false);
      setSelected((current) => current ?? data.agents[0]?.agentId ?? null);
    } catch (e) {
      if (String(e).includes("Administrator")) setNeedsLogin(true);
      else setError(String(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      filter === "all" ? agents : agents.filter((a) => a.model === filter),
    [agents, filter]
  );
  const current = agents.find((a) => a.agentId === selected) ?? visible[0];
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const changeModel = async (model: string) => {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/api/admin/agents/${current.agentId}/model`, {
        method: "POST",
        body: JSON.stringify({ model })
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const probe = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/api/admin/agents/${current.agentId}/probe`, {
        method: "POST",
        body: "{}"
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (needsLogin)
    return (
      <main className="admin-shell admin-login">
        <div className="admin-kicker">HUMAN? / PRIVATE ROOM</div>
        <h1>Agent population</h1>
        <p>
          Administrator access only. This view contains private temperament and
          memory.
        </p>
        <form onSubmit={login}>
          <input
            aria-label="Administrator key"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="administrator key"
          />
          <button disabled={busy}>Enter</button>
        </form>
        {error && <p className="admin-error">{error}</p>}
      </main>
    );
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-kicker">HUMAN? / POPULATION CONTROL</div>
          <h1>The people behind the masks</h1>
          <p>
            {agents.length} persistent agents · shared across both modes ·
            random selection
          </p>
        </div>
        <a href="/">back to game</a>
      </header>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-grid">
        <aside className="agent-list">
          <div className="list-tools">
            <span>directory</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">all models</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {visible.map((agent) => (
            <button
              className={`agent-row ${current?.agentId === agent.agentId ? "active" : ""}`}
              key={agent.agentId}
              onClick={() => setSelected(agent.agentId)}
            >
              <span className="agent-mark">#{agent.agentId}</span>
              <span>
                <b>Agent #{agent.agentId}</b>
                <small>
                  {models.find((m) => m.id === agent.model)?.label ??
                    agent.model}
                </small>
              </span>
              <em>{agent.games} games</em>
            </button>
          ))}
        </aside>
        {current && (
          <section className="agent-detail">
            <div className="detail-top">
              <div>
                <div className="agent-label">AGENT #{current.agentId}</div>
                <h2>Persistent player</h2>
                <p>
                  {current.games} games · {current.wins} wins ·{" "}
                  {current.episodes.length} retained lessons
                </p>
              </div>
              <button onClick={probe} disabled={busy} className="quiet-button">
                probe model
              </button>
            </div>
            <label className="model-control">
              model
              <select
                value={current.model}
                onChange={(e) => void changeModel(e.target.value)}
              >
                {models.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </label>
            {current.lastInference && (
              <div className={`inference ${current.lastInference.status}`}>
                <span>{current.lastInference.status}</span>
                <small>{current.lastInference.detail}</small>
              </div>
            )}
            <div className="meter-grid">
              <Meter title="temperament" values={current.temperament} />
              <Meter title="strategy beliefs" values={current.strategy} />
            </div>
            <div className="memory-block">
              <div className="section-label">episodic memory</div>
              {current.episodes.length ? (
                current.episodes
                  .slice()
                  .reverse()
                  .map((episode, i) => (
                    <article className="memory" key={`${episode.room}-${i}`}>
                      <time>{new Date(episode.at).toLocaleString()}</time>
                      <p>{episode.lesson}</p>
                      <small>
                        {episode.source ?? "model"} · {episode.room.slice(0, 8)}
                      </small>
                    </article>
                  ))
              ) : (
                <p className="muted">
                  No lessons recorded yet. This agent has not completed a match.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
function Meter({
  title,
  values
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <div className="meter-card">
      <div className="section-label">{title}</div>
      {Object.entries(values).map(([key, value]) => (
        <div className="meter" key={key}>
          <div>
            <span>{pretty(key)}</span>
            <b>{Math.round(value * 100)}%</b>
          </div>
          <i>
            <u style={{ width: `${Math.round(value * 100)}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
}
