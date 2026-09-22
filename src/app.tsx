import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ClientAction, Participant, Snapshot } from "./shared";
import { MAX_MESSAGE } from "./shared";

const Arrow = () => <span aria-hidden="true">↗</span>;
const Mark = ({ home }: { home: () => void }) => (
  <button className="wordmark" onClick={home} aria-label="HUMAN? home">
    HUMAN<span>?</span>
  </button>
);
function Avatar({
  person,
  large = false
}: {
  person: Pick<Participant, "symbol">;
  large?: boolean;
}) {
  return (
    <span aria-hidden="true" className={`avatar ${large ? "large" : ""}`}>
      {person.symbol}
    </span>
  );
}
function Rules({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="rules-inner">
        <button className="close" onClick={close} aria-label="Close rules">
          ×
        </button>
        <span className="eyebrow">THE RULES ARE SIMPLE.</span>
        <h2>
          Being yourself
          <br />
          is a bad idea.
        </h2>
        <ol>
          <li>
            <strong>Six strangers. One human.</strong>
            <p>
              That’s you. Five independent AI players are trying to find you.
              They don’t know who the other AI players are either.
            </p>
          </li>
          <li>
            <strong>Talk. Question. Cast doubt.</strong>
            <p>
              You get a new name every game. Steer suspicion toward someone
              else.
            </p>
          </li>
          <li>
            <strong>Vote someone out.</strong>
            <p>
              After each discussion, everyone gets one secret vote. No
              self-votes. Most votes is out; ties are settled randomly. Missing
              votes abstain.
            </p>
          </li>
          <li>
            <strong>Make the final two.</strong>
            <p>
              Survive four eliminations to win. If you’re caught, it’s over.
              Identities stay hidden until the final reveal.
            </p>
          </li>
        </ol>
        <button className="primary" onClick={close}>
          GOT IT <Arrow />
        </button>
      </div>
    </dialog>
  );
}
function Landing({
  start,
  busy,
  error
}: {
  start: () => void;
  busy: boolean;
  error: string;
}) {
  const names = ["chair", "pigeon", "diesel", "rajma", "helmet", "you?"];
  const symbols = ["◒", "✳", "▥", "◈", "▰", "⌁"];
  return (
    <main className="landing">
      <div className="hero-meta">
        <span>
          <i className="dot" /> A GAME OF SOCIAL SURVIVAL
        </span>
        <span>01 HUMAN · 05 IMPOSTORS</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            HUMAN<span>?</span>
          </h1>
          <p className="premise">
            Five of them are AI.
            <br />
            You’re the only human.
            <br />
            <span>Don’t let them figure it out.</span>
          </p>
          <button className="primary enter" onClick={start} disabled={busy}>
            {busy ? "FINDING YOUR SEAT" : "BLEND IN"}{" "}
            {busy ? <span className="spinner" /> : <Arrow />}
          </button>
          <p className="entry-note">No account. No audience. Just suspicion.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div
          className="identity-scene"
          aria-label="Six anonymous identities, one secret"
        >
          <div className="scene-top">
            <span>EVERYONE HAS A NAME.</span>
            <span>NO ONE HAS AN ALIBI.</span>
          </div>
          <div className="identity-grid">
            {names.map((name, i) => (
              <div key={name} className={`identity-card card-${i}`}>
                <span className="card-number">0{i + 1}</span>
                <span className="portrait">{symbols[i]}</span>
                <span className="card-name">{name}</span>
                <span className="card-status">IDENTITY UNKNOWN</span>
              </div>
            ))}
          </div>
          <div className="scene-caption">
            <span className="tiny-cross">+</span>
            <p>“that’s exactly what a human would say.”</p>
            <span className="tiny-cross">+</span>
          </div>
        </div>
      </section>
      <section className="mode-strip" aria-label="Game modes">
        <div className="mode active">
          <span className="mode-index">01</span>
          <div>
            <strong>BLEND IN</strong>
            <p>One human against the room.</p>
          </div>
          <span className="mode-time">
            ~ 5 MIN <span className="accent">↗</span>
          </span>
        </div>
        <div className="mode locked">
          <span className="mode-index">02</span>
          <div>
            <strong>FIND THE AI</strong>
            <p>The tables will turn.</p>
          </div>
          <span className="mode-time">
            COMING LATER <span aria-hidden="true">⊘</span>
          </span>
        </div>
      </section>
      <footer className="landing-foot">
        <span>A LITTLE CONVERSATION. A LOT TO HIDE.</span>
        <span>THE IMITATION GAME © {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
function Reveal({
  state,
  play,
  busy
}: {
  state: Snapshot;
  play: () => void;
  busy: boolean;
}) {
  const [count, setCount] = useState(0);
  const order = [
    ...state.participants.filter((p) => p.id !== state.selfId),
    state.participants.find((p) => p.id === state.selfId)!
  ];
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(6);
      return;
    }
    const timer = setInterval(
      () =>
        setCount((n) => {
          if (n >= 6) clearInterval(timer);
          return Math.min(6, n + 1);
        }),
      520
    );
    return () => clearInterval(timer);
  }, [state.roomId]);
  const complete = count >= 6;
  const survived = state.results.filter(
    (r) => r.eliminated !== state.selfId
  ).length;
  return (
    <main className="reveal">
      <div className="reveal-heading">
        <span className="eyebrow">THE ROOM HAS NOTHING LEFT TO HIDE.</span>
        <h1>
          {!complete ? (
            "Masks off."
          ) : state.outcome === "blended" ? (
            <>
              You passed
              <br />
              for one of them<span>.</span>
            </>
          ) : (
            <>
              A little
              <br />
              too human<span>.</span>
            </>
          )}
        </h1>
        <p>
          {!complete
            ? "Six names. Here’s who was behind them."
            : state.outcome === "blended"
              ? "Four votes. Five artificial minds. You made the final two."
              : `You survived ${survived} of 4 eliminations. The room found you.`}
        </p>
      </div>
      <div className="reveal-roster">
        {order.map((p, i) => {
          const identity = state.identities?.find((x) => x.id === p.id),
            shown = count > i;
          return (
            <div
              key={p.id}
              className={`reveal-person ${shown ? "unmasked" : ""} ${p.id === state.selfId ? "is-you" : ""}`}
            >
              <Avatar person={p} />
              <div className="reveal-name">
                <strong>{p.name}</strong>
                <small>
                  {shown
                    ? identity?.kind === "ai"
                      ? `Agent #${String(identity.agentId).padStart(2, "0")} · ${identity.games ?? 0} ${identity.games === 1 ? "game" : "games"} played`
                      : "The one with something to lose."
                    : "Identity concealed"}
                </small>
              </div>
              <span className="identity-type">
                {shown ? (identity?.kind === "human" ? "YOU" : "AI") : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className={`after-reveal ${complete ? "visible" : ""}`}
        aria-hidden={!complete}
      >
        <div className="memory-note">
          <span aria-hidden="true">↳</span>
          <div>
            <strong>They’ll be here after you leave.</strong>
            <p>
              {state.identities?.some((p) => p.learned)
                ? `Agent #${String(state.identities.find((p) => p.learned)?.agentId).padStart(2, "0")} updated its beliefs after this match.`
                : state.identities?.some((p) => p.reflection === "pending")
                  ? "The room is reflecting. Some of this game may stay with them."
                  : "Same players. New names. Another game added to their history."}
            </p>
          </div>
        </div>
        <button className="primary" onClick={play} disabled={busy || !complete}>
          {busy ? "FINDING YOUR SEAT" : "ANOTHER IDENTITY. ANOTHER CHANCE."}
          <Arrow />
        </button>
        <p className="replay-note">Your next name is waiting.</p>
      </div>
    </main>
  );
}
function Match({
  state,
  connected,
  send,
  error
}: {
  state: Snapshot;
  connected: boolean;
  send: (action: ClientAction) => boolean;
  error: string;
}) {
  const [now, setNow] = useState(Date.now()),
    [text, setText] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null),
    [showLatest, setShowLatest] = useState(false);
  const feed = useRef<HTMLDivElement>(null),
    pinned = useRef(true),
    input = useRef<HTMLTextAreaElement>(null);
  const offset = useRef(state.serverNow - Date.now());
  useEffect(() => {
    offset.current = state.serverNow - Date.now();
  }, [state.serverNow]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setSelected(null);
  }, [state.round, state.phase]);
  useEffect(() => {
    if (sent && state.messages.some((m) => m.id === sent)) {
      setSent(null);
      setText("");
    }
  }, [state.messages, sent]);
  useEffect(() => {
    if (error || !connected) setSent(null);
  }, [error, connected]);
  useEffect(() => {
    if (pinned.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
    else setShowLatest(true);
  }, [state.messages.length, state.phase]);
  const seconds = Math.max(
    0,
    Math.ceil((state.deadline - now - offset.current) / 1000)
  );
  const self = state.participants.find((p) => p.id === state.selfId)!;
  const active = state.participants.filter((p) => !p.eliminated),
    voting = state.phase === "voting";
  const result = state.results.at(-1),
    eliminated = state.participants.find((p) => p.id === result?.eliminated);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || sent) return;
    const id = crypto.randomUUID();
    if (send({ type: "message", text: text.trim(), id })) setSent(id);
  };
  const vote = () => {
    if (selected) send({ type: "vote", target: selected, round: state.round });
  };
  const label =
    state.phase === "arrival"
      ? "TAKE YOUR SEAT"
      : voting
        ? "TRUST YOUR SUSPICION"
        : state.phase === "elimination"
          ? "THE ROOM HAS DECIDED"
          : [
              "MAKE AN IMPRESSION.",
              "SOMEONE IS LYING.",
              "CHOOSE YOUR WORDS.",
              "NOWHERE LEFT TO HIDE."
            ][state.round - 1];
  return (
    <main className={`match ${voting ? "voting" : ""}`}>
      <div className="match-top">
        <div>
          <span className="eyebrow">
            BLEND IN{" "}
            <span className="muted">
              / ROOM {state.roomId.slice(0, 6).toUpperCase()}
            </span>
          </span>
          <h1>{label}</h1>
        </div>
        <div
          className={`clock ${seconds <= 10 && state.phase !== "arrival" ? "urgent" : ""}`}
        >
          <span>
            {voting
              ? "VOTING"
              : state.phase === "elimination"
                ? "NEXT UP"
                : "ROUND " + String(state.round).padStart(2, "0")}
          </span>
          <strong>
            {String(Math.floor(seconds / 60)).padStart(2, "0")}
            <b>:</b>
            {String(seconds % 60).padStart(2, "0")}
          </strong>
        </div>
      </div>
      <div className="match-grid">
        <aside className="roster">
          <div className="roster-title">
            <span>THE ROOM</span>
            <span>{active.length}/6 REMAIN</span>
          </div>
          <div className="participants">
            {state.participants.map((p) => (
              <button
                key={p.id}
                className={`participant ${p.eliminated ? "out" : ""} ${selected === p.id || state.votedFor === p.id ? "selected" : ""}`}
                disabled={
                  !voting ||
                  p.eliminated ||
                  p.id === self.id ||
                  !!state.votedFor ||
                  !connected
                }
                onClick={() => setSelected(p.id)}
                aria-pressed={selected === p.id}
                aria-label={`${p.name}${p.id === self.id ? ", you" : ""}${p.eliminated ? ", eliminated" : voting ? ", select to vote" : ""}`}
              >
                <Avatar person={p} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === self.id && <span className="you-tag">YOU</span>}
                  </strong>
                  <small>
                    {p.eliminated
                      ? "Eliminated"
                      : state.votedFor === p.id
                        ? "Your vote is locked"
                        : voting && p.id !== self.id
                          ? "Suspect?"
                          : "Identity unknown"}
                  </small>
                </div>
                <span className="participant-end">
                  {p.eliminated
                    ? "×"
                    : voting && p.id !== self.id
                      ? selected === p.id || state.votedFor === p.id
                        ? "●"
                        : "○"
                      : "·"}
                </span>
              </button>
            ))}
          </div>
          <div className="your-objective">
            <span className="eyebrow">YOUR ONLY JOB</span>
            <p>
              Let someone else
              <br />
              look human.
            </p>
            <small>
              Survive to the final two.
              <br />
              Identities are revealed at the end.
            </small>
            <div
              className="round-track"
              aria-label={`Round ${state.round} of 4`}
            >
              {[1, 2, 3, 4].map((r) => (
                <span key={r} className={r <= state.round ? "filled" : ""} />
              ))}
            </div>
            <small>ROUND {state.round} OF 4</small>
          </div>
        </aside>
        <section className="conversation">
          <div className="conversation-bar">
            <span>
              <i className={`dot ${connected ? "" : "offline"}`} />{" "}
              {connected
                ? state.phase === "discussion"
                  ? "DISCUSSION OPEN"
                  : state.phase === "arrival"
                    ? "GATHERING THE ROOM"
                    : "DISCUSSION PAUSED"
                : "RECONNECTING"}
            </span>
            <span>EVERY WORD IS EVIDENCE.</span>
          </div>
          <div
            className="feed"
            ref={feed}
            role="log"
            aria-label="Room conversation"
            aria-live="polite"
            onScroll={() => {
              const el = feed.current!;
              pinned.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (pinned.current) setShowLatest(false);
            }}
          >
            <div className="room-notice">
              <span>↳</span>
              <p>
                You are <strong>{self.name}</strong>. They don’t know that
                you’re human.
                <br />
                <span>Say something believable. Or don’t.</span>
              </p>
            </div>
            {state.phase === "arrival" && (
              <div className="arrival">
                <span className="eyebrow">A NEW NAME. A CLEAN SLATE.</span>
                <Avatar person={self} large />
                <h2>{self.name}</h2>
                <p>Keep your story straight.</p>
                <div className="joining-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            {state.messages.length === 0 && state.phase === "discussion" && (
              <div className="quiet">
                <span>“</span>
                <p>A suspiciously quiet room.</p>
                <small>Someone has to go first.</small>
              </div>
            )}
            {state.messages.map((m, i) => {
              const p = state.participants.find((p) => p.id === m.sender)!;
              return (
                <div key={m.id}>
                  {(i === 0 || state.messages[i - 1].round !== m.round) && (
                    <div className="round-divider">
                      <span>ROUND {String(m.round).padStart(2, "0")}</span>
                    </div>
                  )}
                  <article className="message">
                    <Avatar person={p} />
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{p.name}</strong>
                        {p.id === self.id && (
                          <span className="you-tag">YOU</span>
                        )}
                        <time>
                          {new Date(m.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </time>
                      </div>
                      <p>{m.text}</p>
                    </div>
                  </article>
                </div>
              );
            })}
            {voting && (
              <div className="vote-stage">
                <span className="eyebrow">ONE VOTE. NO TAKEBACKS.</span>
                <h2>
                  Who seems
                  <br />
                  <em>too human?</em>
                </h2>
                <p>
                  {state.votedFor
                    ? "Your suspicion is on the record."
                    : "Choose a name in the room. Make it count."}
                </p>
                <div className="vote-targets">
                  {active
                    .filter((p) => p.id !== self.id)
                    .map((p) => (
                      <button
                        key={p.id}
                        className={
                          selected === p.id || state.votedFor === p.id
                            ? "chosen"
                            : ""
                        }
                        disabled={!!state.votedFor || !connected}
                        onClick={() => setSelected(p.id)}
                        aria-pressed={selected === p.id}
                      >
                        <span aria-hidden="true">{p.symbol}</span>
                        {p.name}
                      </button>
                    ))}
                </div>
                <button
                  className="primary vote-confirm"
                  disabled={!selected || !!state.votedFor || !connected}
                  onClick={vote}
                >
                  {state.votedFor
                    ? "VOTE LOCKED ✓"
                    : selected
                      ? `VOTE OUT ${state.participants.find((p) => p.id === selected)?.name.toUpperCase()}`
                      : "SELECT A SUSPECT"}
                  {!state.votedFor && <Arrow />}
                </button>
                <small>
                  {state.voteCount} OF {active.length} VOTES LOCKED
                </small>
              </div>
            )}
            {state.phase === "elimination" && result && (
              <div className="elimination-stage">
                <span className="eyebrow">
                  THE VERDICT · ROUND {state.round}
                </span>
                <h2>
                  {eliminated?.name}
                  <br />
                  <span>is out.</span>
                </h2>
                <p>Their identity stays with them. For now.</p>
                <div className="vote-distribution">
                  {Object.entries(result.counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, n]) => (
                      <div key={id}>
                        <span>
                          {state.participants.find((p) => p.id === id)?.name}
                        </span>
                        <div className="vote-meter">
                          <i
                            style={{
                              width: `${
                                (n /
                                  Math.max(
                                    1,
                                    Object.values(result.counts).reduce(
                                      (a, b) => a + b,
                                      0
                                    )
                                  )) *
                                100
                              }%`
                            }}
                          />
                        </div>
                        <b>{n}</b>
                      </div>
                    ))}
                </div>
                {result.tied && <small>Tied vote. The room drew lots.</small>}
                {result.abstentions > 0 && (
                  <small>{result.abstentions} abstained.</small>
                )}
              </div>
            )}
          </div>
          {showLatest && (
            <button
              className="latest"
              onClick={() => {
                feed.current!.scrollTop = feed.current!.scrollHeight;
                pinned.current = true;
                setShowLatest(false);
              }}
            >
              New messages ↓
            </button>
          )}
          <div className="composer-wrap">
            {(error || state.serviceNotice || !connected) && (
              <output className="inline-error">
                {!connected
                  ? "Connection interrupted. Rejoining your room…"
                  : error || state.serviceNotice}
              </output>
            )}
            <form className="composer" onSubmit={submit}>
              <Avatar person={self} />
              <textarea
                ref={input}
                value={text}
                maxLength={MAX_MESSAGE}
                rows={1}
                aria-label="Your message"
                disabled={
                  state.phase !== "discussion" ||
                  self.eliminated ||
                  !connected ||
                  !!sent
                }
                placeholder={
                  state.phase === "arrival"
                    ? "Get comfortable. Not too comfortable."
                    : state.phase === "discussion"
                      ? "Act natural…"
                      : voting
                        ? "Less talking. More pointing fingers."
                        : "Let that sink in."
                }
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={
                  !text.trim() ||
                  state.phase !== "discussion" ||
                  !connected ||
                  !!sent
                }
              >
                {sent ? "·" : "↑"}
              </button>
            </form>
            <div className="composer-hint">
              <span>YOU ARE {self.name.toUpperCase()}</span>
              <span>
                {text.length > 220
                  ? `${text.length}/${MAX_MESSAGE}`
                  : "ENTER TO SEND"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
export default function App() {
  const [roomId, setRoomId] = useState<string | null>(() =>
    localStorage.getItem("human-room")
  );
  const [state, setState] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rules, setRules] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false,
      retry: ReturnType<typeof setTimeout>,
      attempt = 0;
    const accept = (s: Snapshot) =>
      setState((previous) =>
        previous &&
        previous.roomId === s.roomId &&
        previous.revision > s.revision
          ? previous
          : s
      );
    const connect = async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}`);
        if (!response.ok) {
          const data = (await response.json()) as { error: string };
          throw new Error(data.error);
        }
        const next = (await response.json()) as Snapshot;
        if (cancelled) return;
        accept(next);
        const ws = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${roomId}/socket`
        );
        socket.current = ws;
        ws.onopen = () => {
          if (cancelled) {
            ws.close();
            return;
          }
          attempt = 0;
          setConnected(true);
          setError("");
          setUnavailable(false);
        };
        ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            if (packet.type === "state") accept(packet.state);
            else if (packet.type === "error") setError(packet.message);
          } catch {
            setError("A room update was interrupted. Reconnecting…");
            ws.close();
          }
        };
        ws.onclose = () => {
          setConnected(false);
          if (!cancelled)
            retry = setTimeout(connect, Math.min(10000, 800 * 2 ** attempt++));
        };
        ws.onerror = () => ws.close();
      } catch (err) {
        if (!cancelled) {
          setError(String(err instanceof Error ? err.message : err));
          setUnavailable(true);
          retry = setTimeout(connect, 5000);
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [roomId]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = (await response.json()) as {
        roomId?: string;
        error?: string;
      };
      if (!response.ok || !data.roomId)
        throw new Error(data.error || "Could not find a room. Try again.");
      localStorage.setItem("human-room", data.roomId);
      setState(null);
      setUnavailable(false);
      setRoomId(data.roomId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the room. Try again."
      );
    } finally {
      setBusy(false);
    }
  };
  const home = () => {
    if (
      roomId &&
      state &&
      state.phase !== "reveal" &&
      state.phase !== "interrupted"
    ) {
      setRules(true);
      return;
    }
    localStorage.removeItem("human-room");
    setRoomId(null);
    setState(null);
    setError("");
  };
  const send = (action: ClientAction) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError("Reconnecting. Keep that thought.");
      return false;
    }
    setError("");
    socket.current.send(JSON.stringify(action));
    return true;
  };
  return (
    <>
      <header className="site-header">
        <Mark home={home} />
        <span className="header-center">THE IMITATION GAME</span>
        <button className="rules-button" onClick={() => setRules(true)}>
          HOW TO PLAY <span>↗</span>
        </button>
      </header>
      {!roomId ? (
        <Landing start={start} busy={busy} error={error} />
      ) : !state ? (
        <main className="loading">
          <span className="eyebrow">LEAVE YOURSELF AT THE DOOR.</span>
          <h1>{unavailable ? "Lost the room." : "Finding your alias…"}</h1>
          {unavailable ? (
            <>
              <p role="alert">{error}</p>
              <button className="primary" onClick={start} disabled={busy}>
                START A FRESH MATCH <Arrow />
              </button>
            </>
          ) : (
            <span className="spinner" />
          )}
        </main>
      ) : state.phase === "interrupted" ? (
        <main className="loading">
          <span className="eyebrow">CONNECTION LOST.</span>
          <h1>The room went quiet.</h1>
          <p>
            The room couldn’t stay connected. This match won’t count. Try again
            a little later.
          </p>
          <button className="primary" onClick={home}>
            BACK TO THE DOOR <Arrow />
          </button>
        </main>
      ) : state.phase === "reveal" ? (
        <>
          <Reveal key={roomId} state={state} play={start} busy={busy} />
          {error && (
            <p className="reveal-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <Match
          key={roomId}
          state={state}
          connected={connected}
          send={send}
          error={error}
        />
      )}
      {rules && <Rules close={() => setRules(false)} />}
    </>
  );
}
