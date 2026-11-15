import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryFlightPose,entryProgress,cutsceneProgress} from '../engine/entry-flight.mjs';

test('boosters peel away before spacecraft release and everything reverses exactly',()=>{
  const launch=entryFlightPose(.2),boosters=entryFlightPose(.45),release=entryFlightPose(.72),end=entryFlightPose(1);
  assert.equal(launch.boosterSplit,0);assert.equal(launch.spacecraftSplit,0);
  assert.ok(boosters.boosterSplit>0);assert.equal(boosters.spacecraftSplit,0);
  assert.ok(release.spacecraftSplit>0);assert.ok(release.boosterSplit>boosters.boosterSplit);
  assert.equal(end.opacity,0);assert.equal(entryFlightPose(0).opacity,0);
  const first=entryFlightPose(.45);entryFlightPose(.9);assert.deepEqual(entryFlightPose(.45),first);
  assert.deepEqual(entryFlightPose(-1),entryFlightPose(0));assert.deepEqual(entryFlightPose(2),end);
});
test('scroll never snaps to completion; readiness holds are reversible',()=>{
  assert.equal(entryProgress(.87,10,1000),.88);
  assert.equal(entryProgress(.88,-100,1000),.78);
  assert.equal(entryProgress(.1,-1000,1000),0);
  assert.equal(entryProgress(.9,1000,1000),1);
});
test('one launch trigger advances automatically, holds for assets/map and finishes in under five seconds',()=>{
  let progress=0;
  progress=cutsceneProgress(progress,500,false,false);assert.equal(progress,.08);
  progress=cutsceneProgress(progress,5000,true,false);assert.equal(progress,.96);
  assert.equal(cutsceneProgress(progress,500,true,true),1);
  assert.equal(cutsceneProgress(0,4800,true,true),1);
});
