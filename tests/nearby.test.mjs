import { test } from "node:test";
import assert from "node:assert/strict";
import { compareNearby, lunarDistanceKm, nearbyMetrics, nearbyPoints, nearbySky } from "../engine/nearby.mjs";
import { DAY } from "../engine/index.mjs";

test("sampling stays within the requested radius at the poles and across longitude wrap", () => {
  for (const center of [{ lat: -90, lon: 180 }, { lat: 0, lon: 179.99 }, { lat: 88, lon: -20 }]) {
    const points = nearbyPoints(center, 20, []);
    assert.equal(points.length, 8);
    for (const point of points) {
      assert.ok(Math.abs(lunarDistanceKm(center, point) - point.distanceKm) < 1e-9);
      assert.ok(point.lon >= -180 && point.lon < 180);
    }
  }
  const center = { id: "start", lat: 0, lon: 179.99 };
  assert.equal(nearbyPoints(center, 2, [center, { id: "wrapped", lat: 0, lon: -179.99 }])[0].id, "wrapped");
});

test("nearby screening reprojects JPL observations with observer displacement", () => {
  const body = [[0, 0, 90, 1800, 380000], [DAY, 0, 90, 1800, 380000]];
  const packet = { sun: body, earth: body, observer: { lat: 0, lon: 0, elevationM: 0, mastM: 0 } };
  const offset = nearbySky(packet, { lat: 0, lon: 1 }, 0, 0, 0, 1).earth[0];
  const rad = Math.PI / 180;
  const targetDistanceFromMoonCenter = 380000 + 1737.4;
  const expectedEl = Math.atan2(targetDistanceFromMoonCenter * Math.cos(rad) - 1737.4,
    targetDistanceFromMoonCenter * Math.sin(rad)) / rad;
  assert.ok(Math.abs(offset[1] - 270) < 1e-9);
  assert.ok(Math.abs(offset[2] - expectedEl) < 1e-9);
  assert.ok(offset[4] > 380000);
  assert.deepEqual(nearbySky(packet, { lat: 0, lon: 1 }, 0, 0, DAY, 1).earth, []);
});

test("ranking puts candidates meeting limits first and needs actual horizon and sky coverage", () => {
  const data = {
    sun: [[0, 90, 20, 1920, 149597870], [DAY, 90, 20, 1920, 149597870]],
    earth: [[0, 270, 10, 6800, 380000], [DAY, 270, 10, 6800, 380000]],
  };
  const profile = { minSunlitPct: 90, minEarthDtePct: 50, maxDarknessHours: 1 };
  assert.equal(nearbyMetrics(data, 0, 1, null, 5, profile), null);
  assert.equal(nearbyMetrics(data, 0, 2, [0], 5, profile), null);
  const good = nearbyMetrics(data, 0, 1, [0], 5, profile);
  const blocked = nearbyMetrics(data, 0, 1, [25], 5, profile);
  assert.deepEqual(good, { sunlight: 100, contact: 100, darkness: 0, meetsLimits: true, score: 100 });
  assert.equal(blocked.meetsLimits, false);
  assert.equal(blocked.darkness, 24);
  assert.equal(blocked.score, 0);
  assert.ok(compareNearby({ ...good, distanceKm: 10 }, { ...blocked, distanceKm: 1 }) < 0);
});
