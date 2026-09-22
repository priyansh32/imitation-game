import type {
  BallotResult,
  Message,
  Participant,
  Phase,
  Snapshot
} from "./shared";
import { MAX_MESSAGE } from "./shared";
export interface Behavior {
  responseDelayMean: number;
  responseDelayVariance: number;
  doubleTextFrequency: number;
  emojiFrequency: number;
  messageLengthBias: number;
  responseProbability: number;
}
export interface PrivatePlayer extends Participant {
  agentId?: number;
  behavior?: Behavior;
  nextThink: number;
  busyUntil: number;
  failures?: number;
  decisions?: number;
  lastSent: number;
  suspicion: Record<string, number>;
  hypothesis: string;
}
export interface Pending {
  sender: string;
  at: number;
  text?: string;
  target?: string;
  round: number;
  phase: Phase;
}
export interface RoomState {
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
export const POPULATION = [9, 17, 26, 42, 63, 81, 88, 94, 103, 117, 129, 138, 151, 163, 172, 185, 197, 211];
export function shuffle<T>(values: T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function publicState(s: RoomState, now = Date.now()): Snapshot {
  const self = s.players.find((p) => p.agentId === undefined)!;
  return {
    roomId: s.roomId,
    revision: s.revision,
    phase: s.phase,
    round: s.round,
    maxRounds: s.maxRounds,
    deadline: s.deadline,
    serverNow: now,
    participants: s.players.map(({ id, name, symbol, eliminated }) => ({
      id,
      name,
      symbol,
      eliminated
    })),
    messages: s.messages,
    selfId: self.id,
    votedFor: s.votes[self.id] ?? null,
    voteCount: Object.keys(s.votes).length,
    results: s.results,
    serviceNotice: s.serviceNotice,
    ...(s.phase === "reveal"
      ? {
          outcome: s.outcome,
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
  p.lastSent = now;
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
  return null;
}
export function transition(s: RoomState, now: number): void {
  s.pending = [];
  for (const p of s.players) p.busyUntil = 0;
  if (s.phase === "arrival" || (s.phase === "elimination" && !s.outcome)) {
    if (s.phase === "elimination") s.round++;
    s.phase = "discussion";
    s.votes = {};
    s.deadline = now + s.durations.discussion;
    for (const p of s.players) {
      p.nextThink = now + 1000 + Math.random() * 6500;
      p.decisions = 0;
    }
  } else if (s.phase === "discussion") {
    s.phase = "voting";
    s.deadline = now + s.durations.voting;
    for (const p of s.players) p.nextThink = now + Math.random() * 4500;
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
    s.results.push({
      round: s.round,
      counts,
      eliminated: eliminated.id,
      tied: leaders.length > 1,
      abstentions: active.length - Object.keys(s.votes).length
    });
    s.phase = "elimination";
    s.deadline = now + s.durations.elimination;
    if (eliminated.agentId === undefined) s.outcome = "caught";
    else if (active.length - 1 <= 2) s.outcome = "blended";
  } else if (s.phase === "elimination") {
    s.phase = "reveal";
    s.deadline = 0;
    s.finishedAt = now;
  }
}
export function behaviorDelay(b: Behavior): number {
  return Math.max(
    1900,
    (b.responseDelayMean +
      (Math.random() + Math.random() - 1) * b.responseDelayVariance) *
      1000
  );
}
