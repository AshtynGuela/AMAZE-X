import { test } from "node:test";
import assert from "node:assert/strict";
import { rockySpeech } from "../engine/rocky-speech.mjs";

test("Rocky marks questions and explanations without changing calculated text", () => {
  assert.equal(rockySpeech("Apollo 12 gives 2.50 h more sunlight."), "Apollo 12 gives 2.50 h more sunlight. Statement.");
  assert.equal(rockySpeech("Want to compare these sites?"), "Want to compare these sites? Question?");
  assert.equal(rockySpeech("Rocky helps"), "Rocky helps. Statement.");
  assert.equal(rockySpeech("Try another site, question?"), "Try another site, Question?");
  assert.equal(rockySpeech("Earth behind ridge. Warning."), "Earth behind ridge. Warning.");
  const once = rockySpeech("Good. Statement.");
  assert.equal(rockySpeech(once), once);
});
