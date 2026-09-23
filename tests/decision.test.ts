import { test } from "node:test";
import assert from "node:assert/strict";
import { actionProbability, behaviorDelay } from "../src/game";
import { noveltyCheck } from "../src/novelty";

test("novelty rejects repeated arguments but permits intentional social agreement", () => {
  const recent = [{ text: "pigeon seems human because of the typos" }];
  assert.equal(
    noveltyCheck(
      "chair seems human because of the typos",
      recent,
      "ACCUSATION"
    ),
    "REDUNDANT"
  );
  assert.equal(noveltyCheck("same", recent, "AGREE"), "SOCIAL_AGREEMENT");
  assert.equal(
    noveltyCheck(
      "why did your read change after that vote?",
      recent,
      "QUESTION"
    ),
    "PASS"
  );
});

test("personality biases action choice toward silence", () => {
  const choose = (
    responseProbability: number,
    silence: number,
    relevant: boolean
  ) =>
    Math.random() > actionProbability(responseProbability, silence, relevant, 0)
      ? "SILENCE"
      : "MESSAGE";
  const quiet = Array.from({ length: 40 }, () => choose(0.08, 0.95, false));
  const active = Array.from({ length: 40 }, () => choose(0.98, 0.05, true));
  assert.ok(
    quiet.filter((result) => result === "SILENCE").length >
      active.filter((result) => result === "SILENCE").length
  );
});

test("behavioral delay varies within a personality", () => {
  const profile = {
    responseDelayMean: 4,
    responseDelayVariance: 2,
    doubleTextFrequency: 0,
    emojiFrequency: 0,
    messageLengthBias: 0.5,
    responseProbability: 0.5
  };
  const delays = new Set(
    Array.from({ length: 24 }, () => behaviorDelay(profile))
  );
  assert.ok(delays.size > 4);
});
