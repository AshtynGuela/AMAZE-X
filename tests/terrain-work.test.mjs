import { test } from "node:test";
import assert from "node:assert/strict";
import { runTerrainWork } from "../server/terrain-work.mjs";

test("a queued detailed horizon leaves a slot for rapid evaluation", async () => {
  let finish;
  const started = [];
  const first = runTerrainWork(async () => { started.push("full-1"); await new Promise(resolve => {finish=resolve;}); }, {heavy:true});
  const second = runTerrainWork(async () => { started.push("full-2"); }, {heavy:true});
  await runTerrainWork(async () => { started.push("quick"); }, {priority:2});
  assert.deepEqual(started, ["full-1", "quick"]);
  finish(); await Promise.all([first, second]);
  assert.deepEqual(started, ["full-1", "quick", "full-2"]);
});
