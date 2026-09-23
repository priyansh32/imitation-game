// Server-side catalog. This module is not imported by the public game client.
export const MODELS = [
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 · 70B",
    family: "Meta",
    description: "Larger conversational model"
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fast",
    label: "Llama 3.1 · 8B",
    family: "Meta",
    description: "Smaller, faster baseline"
  },
  {
    id: "@cf/qwen/qwen3-30b-a3b-fp8",
    label: "Qwen 3 · 30B",
    family: "Qwen",
    description: "Mixture-of-experts alternative"
  }
] as const;
export type ModelId = (typeof MODELS)[number]["id"];
export function isModel(value: unknown): value is ModelId {
  return MODELS.some((m) => m.id === value);
}
