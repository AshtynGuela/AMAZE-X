import test from "node:test";
import assert from "node:assert/strict";
import { siteScore } from "../engine/site-score.mjs";

test("site score assigns the advertised points for each measured factor", () => {
  const result = siteScore({ sunlitPct: 75, earthDtePct: 50, longestDarkH: 6 }, 1);
  assert.equal(result.percent, 65);
  assert.equal(result.darknessShare, 25);
  assert.deepEqual(result.factors.map(({ points, weight }) => [points, weight]), [
    [30, 40], [20, 40], [15, 20],
  ]);
});

test("full light and contact score 100; a fully dark stay without contact scores 0", () => {
  assert.equal(siteScore({ sunlitPct: 100, earthDtePct: 100, longestDarkH: 0 }, 2).percent, 100);
  assert.equal(siteScore({ sunlitPct: 0, earthDtePct: 0, longestDarkH: 48 }, 2).percent, 0);
  assert.equal(siteScore({ sunlitPct: 100, earthDtePct: 0, longestDarkH: 0 }, 1).percent, 60);
});

test("partial or invalid inputs cannot produce a score", () => {
  assert.equal(siteScore({ sunlitPct: 80, longestDarkH: 12 }, 1), null);
  assert.equal(siteScore({ sunlitPct: 80, earthDtePct: 40, longestDarkH: 12 }, 0), null);
});
