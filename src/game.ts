import type {
  BallotResult,
  Message,
  Participant,
  Phase,
  Snapshot
} from "./shared";
import { MAX_MESSAGE } from "./shared";
import type { GameMode } from "./shared";
import { MODES } from "./modes";
export interface Behavior {
  responseDelayMean: number;
  responseDelayVariance: number;
  doubleTextFrequency: number;
  emojiFrequency: number;
  messageLengthBias: number;
  responseProbability: number;
}
export interface ParticipantBelief {
  threat?: number;
  participantId: string;
  humanProbability: number;
  confidence: number;
  reasons: string[];
  lastUpdatedAt: number;
}
export interface RoomEvent {
  kind: "message" | "vote" | "elimination" | "round";
  participantId?: string;
  targetParticipantId?: string;
  text?: string;
  at: number;
  round: number;
}
export interface PrivatePlayer extends Participant {
  session?: string;
  disconnectedAt?: number;
  eliminatedAt?: number;
  agentId?: number;
  behavior?: Behavior;
  nextThink: number;
  busyUntil: number;
  failures?: number;
  decisions?: number;
  lastSent: number;
  suspicion: Record<string, number>;
  beliefs?: Record<string, ParticipantBelief>;
  hypothesis: string;
  observedRevision?: number;
  messagesThisRound?: number;
  lastMessageAt?: number;
  consecutiveMessages?: number;
  activityBudget?: number;
}
export interface Pending {
  sender: string;
  at: number;
  text?: string;
  target?: string;
  round: number;
  phase: Phase;
}
export interface DecisionTrace {
  agentId: number;
  observed: string;
  beliefs: ParticipantBelief[];
  action: string;
  intent: string | null;
  reason: string;
  candidate?: string;
  novelty: string;
  delay?: number;
  at: number;
}
export interface RoomState {
  mode?: GameMode;
  startedAt?: number;
  startToken?: string;
  expiresAt?: number;
  roomId: string;
  owner: string;
  revision: number;
  phase: Phase;
  round: number;
  maxRounds: number;
  deadline: number;
  players: PrivatePlayer[];
  messages: Message[];
  votes: Record<string, string>;
  ballots?: Record<number, Record<string, string>>;
  results: BallotResult[];
  pending: Pending[];
  durations: {
    arrival: number;
    discussion: number;
    voting: number;
    elimination: number;
  };
  outcome?: "blended" | "caught";
  reflection: Record<
    string,
    {
      games: number;
      learned: boolean;
      status: "pending" | "complete" | "unavailable";
    }
  >;
  reflectionBusy: Record<string, number>;
  finishedAt?: number;
  serviceNotice?: string;
  eventVersion?: number;
  chainDepth?: number;
  decisionTrace?: Record<string, DecisionTrace>;
}
export const NAMES = [
  "wet_sock",
  "diesel",
  "pigeon",
  "rajma",
  "chair",
  "helmet",
  "receipt",
  "moth",
  "sidequest",
  "noodle",
  "left_shoe",
  "pickle",
  "doorbell",
  "crumb",
  "almost",
  "static",
  "milk_teeth",
  "soup",
  "puddle",
  "onion"
];
export const SYMBOLS = ["◒", "▥", "✳", "◈", "▰", "⌁"];
export const POPULATION = [
  9, 17, 26, 42, 63, 81, 88, 94, 103, 117, 129, 138, 151, 163, 172, 185, 197,
  211
];
export function shuffle<T>(values: T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function publicState(
  s: RoomState,
  now = Date.now(),
  session = s.owner
): Snapshot {
  const self =
    s.players.find((p) => p.session === session) ??
    (s.mode !== "FIND_THE_AI" && session === s.owner
      ? s.players.find((p) => p.agentId === undefined)
      : undefined);
  const waiting = s.phase === "waiting" || s.phase === "starting";
  return {
    mode: s.mode ?? "BLEND_IN",
    ...(waiting
      ? {
          lobby: {
            joined: s.players.filter(
              (p) => p.agentId === undefined && !p.disconnectedAt
            ).length,
            required: MODES[s.mode ?? "BLEND_IN"].humans
          }
        }
      : {}),
    roomId: s.roomId,
    revision: s.revision,
    phase: s.phase,
    round: s.round,
    maxRounds: s.maxRounds,
    deadline: s.deadline,
    serverNow: now,
    participants: waiting
      ? []
      : s.players.map(({ id, name, symbol, eliminated }) => ({
          id,
          name,
          symbol,
          eliminated
        })),
    messages: s.messages,
    selfId: waiting ? "" : (self?.id ?? ""),
    votedFor: self ? (s.votes[self.id] ?? null) : null,
    voteCount: Object.keys(s.votes).length,
    results: s.results,
    serviceNotice: s.serviceNotice,
    ...(s.phase === "reveal"
      ? {
          outcome: s.outcome,
          humanWon: s.outcome === MODES[s.mode ?? "BLEND_IN"].humanWins,
          identities: s.players.map((p) =>
            p.agentId === undefined
              ? { id: p.id, kind: "human" as const }
              : {
                  id: p.id,
                  kind: "ai" as const,
                  agentId: p.agentId,
                  games: s.reflection[p.id]?.games ?? 0,
                  learned: s.reflection[p.id]?.learned ?? false,
                  reflection: s.reflection[p.id]?.status ?? "pending"
                }
          )
        }
      : {})
  };
}
export function addMessage(
  s: RoomState,
  sender: string,
  text: string,
  id: string,
  now: number
): string | null {
  if (s.messages.some((m) => m.id === id)) return null;
  const p = s.players.find((p) => p.id === sender);
  if (!p || p.eliminated || s.phase !== "discussion" || now >= s.deadline)
    return "Discussion has ended.";
  if (!text.trim() || text.length > MAX_MESSAGE)
    return `Use 1–${MAX_MESSAGE} characters.`;
  if (now - p.lastSent < 1800) return "Give that thought a second to land.";
  s.messages.push({
    id,
    sender,
    text: text.trim(),
    at: Math.floor(now / 1000) * 1000,
    round: s.round
  });
  s.eventVersion = (s.eventVersion ?? 0) + 1;
  s.chainDepth =
    p.agentId === undefined ? 0 : Math.min(4, (s.chainDepth ?? 0) + 1);
  p.lastSent = now;
  p.lastMessageAt = now;
  p.messagesThisRound = (p.messagesThisRound ?? 0) + 1;
  p.consecutiveMessages = (p.consecutiveMessages ?? 0) + 1;
  return null;
}
export function castVote(
  s: RoomState,
  sender: string,
  target: string,
  round: number,
  now: number
): string | null {
  const p = s.players.find((p) => p.id === sender),
    t = s.players.find((p) => p.id === target);
  if (s.phase !== "voting" || now >= s.deadline || round !== s.round)
    return "That vote has closed.";
  if (!p || !t || p.eliminated || t.eliminated || sender === target)
    return "Choose another active participant.";
  if (s.votes[sender])
    return s.votes[sender] === target ? null : "Your vote is already locked.";
  s.votes[sender] = target;
  s.eventVersion = (s.eventVersion ?? 0) + 1;
  return null;
}
export function transition(s: RoomState, now: number): void {
  s.pending = [];
  s.eventVersion = (s.eventVersion ?? 0) + 1;
  s.chainDepth = 0;
  for (const p of s.players) p.busyUntil = 0;
  if (s.phase === "arrival" || (s.phase === "elimination" && !s.outcome)) {
    if (s.phase === "elimination") s.round++;
    s.phase = "discussion";
    s.votes = {};
    s.deadline = now + s.durations.discussion;
    for (const p of s.players) {
      p.nextThink = now + 1000 + Math.random() * 6500;
      p.decisions = 0;
      p.messagesThisRound = 0;
      p.consecutiveMessages = 0;
      p.activityBudget = 2 + Math.floor(Math.random() * 4);
    }
  } else if (s.phase === "discussion") {
    s.phase = "voting";
    s.deadline = now + s.durations.voting;
    for (const p of s.players) {
      p.nextThink = now + Math.random() * 4500;
      p.consecutiveMessages = 0;
    }
  } else if (s.phase === "voting") {
    s.ballots ??= {};
    s.ballots[s.round] = { ...s.votes };
    const active = s.players.filter((p) => !p.eliminated);
    const counts: Record<string, number> = Object.fromEntries(
      active.map((p) => [p.id, 0])
    );
    for (const target of Object.values(s.votes))
      if (target in counts) counts[target]++;
    const max = Math.max(...Object.values(counts));
    const leaders = active.filter((p) => counts[p.id] === max);
    const eliminated = shuffle(leaders)[0];
    eliminated.eliminated = true;
    eliminated.eliminatedAt = now;
    s.results.push({
      round: s.round,
      counts,
      eliminated: eliminated.id,
      tied: leaders.length > 1,
      abstentions: active.length - Object.keys(s.votes).length
    });
    s.phase = "elimination";
    s.deadline = now + s.durations.elimination;
    s.outcome = outcomeFor(s);
  } else if (s.phase === "elimination") {
    s.phase = "reveal";
    s.deadline = 0;
    s.finishedAt = now;
  }
}
export function behaviorDelay(b: Behavior): number {
  const swing = (Math.random() + Math.random() - 1) * b.responseDelayVariance;
  const rarePause = Math.random() < 0.08 ? b.responseDelayVariance * 2.4 : 0;
  const quickReaction =
    Math.random() < 0.12 ? -b.responseDelayVariance * 0.72 : 0;
  return Math.max(
    1900,
    (b.responseDelayMean + swing + rarePause + quickReaction) * 1000
  );
}
export function outcomeFor(s: RoomState): RoomState["outcome"] {
  const minority = MODES[s.mode ?? "BLEND_IN"].minority;
  if (
    s.players.some(
      (p) =>
        p.eliminated && (p.agentId === undefined ? "human" : "ai") === minority
    )
  )
    return "caught";
  if (s.players.filter((p) => !p.eliminated).length <= 2) return "blended";
  return undefined;
}
export function actionProbability(
  responseProbability: number,
  silenceBelief: number,
  relevant: boolean,
  recentMessages: number
): number {
  const recentPenalty = Math.min(0.55, recentMessages * 0.12);
  return Math.max(
    0.04,
    Math.min(
      0.92,
      responseProbability +
        (relevant ? 0.18 : -0.08) -
        recentPenalty -
        (silenceBelief - 0.5) * 0.25
    )
  );
}
