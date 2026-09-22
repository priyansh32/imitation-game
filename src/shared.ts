export type Phase =
  | "arrival"
  | "discussion"
  | "voting"
  | "elimination"
  | "reveal"
  | "interrupted";
export interface Participant {
  id: string;
  name: string;
  symbol: string;
  eliminated: boolean;
}
export interface Message {
  id: string;
  sender: string;
  text: string;
  at: number;
  round: number;
}
export interface BallotResult {
  round: number;
  counts: Record<string, number>;
  eliminated: string;
  tied: boolean;
  abstentions: number;
}
export interface Identity {
  id: string;
  kind: "human" | "ai";
  agentId?: number;
  games?: number;
  learned?: boolean;
  reflection?: "pending" | "complete" | "unavailable";
}
export interface Snapshot {
  roomId: string;
  revision: number;
  phase: Phase;
  round: number;
  maxRounds: number;
  deadline: number;
  serverNow: number;
  participants: Participant[];
  messages: Message[];
  selfId: string;
  votedFor: string | null;
  voteCount: number;
  results: BallotResult[];
  outcome?: "blended" | "caught";
  identities?: Identity[];
  serviceNotice?: string;
}
export type ClientAction =
  | { type: "message"; text: string; id: string }
  | { type: "vote"; target: string; round: number };
export const MAX_MESSAGE = 280;
