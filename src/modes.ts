import type { GameMode } from "./shared";
// All modes use player-${agentId}. Roles never change storage identity.
export const MODES = {
  BLEND_IN: {
    humans: 1,
    agents: 5,
    role: "HUNTER",
    minority: "human",
    objective: "Identify the single human and avoid eliminating AI players.",
    knownFacts:
      "You are AI. Exactly one of the other original participants is human. You do not know which others are AI. Eliminations conceal identity.",
    humanWins: "blended"
  },
  FIND_THE_AI: {
    humans: 5,
    agents: 1,
    role: "INFILTRATOR",
    minority: "ai",
    objective:
      "Avoid being identified as AI. Survive to the final two. Vote strategically to protect yourself.",
    knownFacts:
      "You are the only AI. All five other original participants are humans trying to identify you. Human probability is known to be 1; assess social threats instead. Eliminations conceal identity.",
    humanWins: "caught"
  }
} as const;
export type AgentRole = "HUNTER" | "INFILTRATOR";
export interface AgentMatchContext {
  matchId: string;
  mode: GameMode;
  role: AgentRole;
  objective: string;
  knownFacts: string;
}
export function matchContext(
  matchId: string,
  mode: GameMode = "BLEND_IN"
): AgentMatchContext {
  const { role, objective, knownFacts } = MODES[mode];
  return { matchId, mode, role, objective, knownFacts };
}
