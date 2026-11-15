import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terrainCanReplace} from '../engine/terrain-quality.mjs';
test('late preview or retry responses cannot replace a more detailed horizon',()=>{
  assert.equal(terrainCanReplace({quality:'full'},{quality:'preview'}),false);
  assert.equal(terrainCanReplace({quality:'quick'},{quality:'preview'}),false);
  assert.equal(terrainCanReplace({quality:'preview'},{quality:'full'}),true);
  assert.equal(terrainCanReplace({masks:{}},{quality:'quick'}),false);
});
