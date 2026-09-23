export type NoveltyIntent =
  | "ACCUSATION"
  | "QUESTION"
  | "DEFENSE_SELF"
  | "DEFENSE_OTHER"
  | "AGREE"
  | "DISAGREE"
  | "PROVIDE_EVIDENCE"
  | "PROBE"
  | "CHANGE_SUSPICION"
  | "SOCIAL"
  | "MISDIRECT";
export interface RecentMessage {
  text: string;
}
const agreementWords = new Set([
  "same",
  "yeah",
  "exactly",
  "nah",
  "100",
  "true",
  "agreed",
  "lol"
]);
export function noveltyCheck(
  text: string,
  recent: RecentMessage[],
  intent: NoveltyIntent
): "PASS" | "SOCIAL_AGREEMENT" | "REDUNDANT" {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  const words = new Set(
    normalized.split(/\s+/).filter((word) => word.length > 2)
  );
  if (words.size <= 2 && [...words].some((word) => agreementWords.has(word)))
    return "SOCIAL_AGREEMENT";
  if (!words.size) return "REDUNDANT";
  for (const message of recent.slice(-12)) {
    const previous = new Set(
      message.text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2)
    );
    const overlap =
      [...words].filter((word) => previous.has(word)).length /
      Math.max(words.size, previous.size);
    if (overlap >= (intent === "AGREE" ? 0.86 : 0.62) && words.size >= 3)
      return "REDUNDANT";
  }
  return "PASS";
}
