import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AU_KM } from '../engine/solar.mjs';
import { lunarCelestialState, lunarSceneVector } from '../engine/celestial-context.mjs';

const time = Date.parse('2026-11-15T00:00:00Z');
const earth = { samples: [[time,1,0,0,0,0,0],[time+86400000,1,0,0,0,0,0]],
  orbit: [[time,1,0,0],[time+86400000,0,1,0]] };
const moon = { samples: [[time,1,.0025,0,0,0,0],[time+86400000,1,-.0025,0,0,0,0]] };

test('Moon-centred body distances and orbit paths come from paired JPL vectors', () => {
  const context=lunarCelestialState({earth,moon},time);
  assert.ok(Math.abs(Math.hypot(...context.earthM)-.0025*AU_KM*1000)<.001);
  assert.ok(Math.abs(Math.hypot(...context.sunM)-Math.hypot(1,.0025)*AU_KM*1000)<.001);
  assert.equal(context.earthLunarOrbitM.length,2);
  assert.equal(context.earthSolarOrbitM.length,2);
  assert.ok(Math.abs(Math.hypot(...context.earthLunarOrbitM[1])-.0025*AU_KM*1000)<.001);
  assert.deepEqual(context.earthSolarOrbitM[0],context.earthM);
});

test('missing or out-of-range ephemerides never create a substitute orbit', () => {
  assert.equal(lunarCelestialState({earth},time),null);
  assert.equal(lunarCelestialState({earth,moon},time-1),null);
  assert.equal(lunarCelestialState({earth,moon},time+86400001),null);
});

test('readable scene coordinates preserve direction and separate scale from physical distance', () => {
  const context=lunarCelestialState({earth,moon},time);
  for (const vector of [context.earthM,context.sunM]) {
    const physical=lunarSceneVector(vector,true),readable=lunarSceneVector(vector,false);
    const dot=physical.reduce((s,n,i)=>s+n*readable[i],0)/Math.hypot(...physical)/Math.hypot(...readable);
    assert.ok(Math.abs(dot-1)<1e-12);
    assert.ok(Math.abs(Math.hypot(...physical)-Math.hypot(...vector)*1e-7)<1e-9);
  }
  assert.ok(Math.hypot(...lunarSceneVector(context.sunM,false))<250);
});
