import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttributeCompression, Cartesian3, Ellipsoid, GeographicTilingScheme, Rectangle } from 'cesium';
import { withPolarTerrain } from '../src/polarTerrain.ts';
import { polarMesh } from '../engine/polar-mesh.mjs';

test('both polar replacements provide the vertex normals promised to the globe shader', async () => {
  const tilingScheme = new GeographicTilingScheme({ellipsoid:new Ellipsoid(1737400,1737400,1737400)});
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,json:async()=>({size:65,resolutionM:20,
    heightsM:Array.from({length:65*65},(_,i)=>20*Math.sin(i%65/64*Math.PI))})});
  try {
    const base={tilingScheme,hasVertexNormals:true,getTileDataAvailable:()=>true};
    const provider=withPolarTerrain(base);
    for(const y of [0,7]) {
      const tile=await provider.requestTileGeometry(0,y,3);
      const normals = tile._encodedNormals;
      assert.ok(normals?.length > 0, 'Polar heightmaps lack normals while the shared provider advertises normals: the lighting shader reads the wrong vertex attributes');
      assert.equal(normals.length,65*65*2);
      assert.ok(normals.every(Number.isFinite));
    }
    provider.dispose();
  } finally {globalThis.fetch=original;}
});

test('north and south pole heights remain sampleable at every longitude after mesh conversion', () => {
  const moon = new Ellipsoid(1737400,1737400,1737400);
  for (const north of [true,false]) {
    const rectangle=Rectangle.fromDegrees(0,north?89:-90,1,north?90:-89);
    const tile=polarMesh({size:65,heightsM:Array(65*65).fill(-123.25)},rectangle,moon);
    for(const fraction of [0,.13,.5,.83,1]) {
      const height=tile.interpolateHeight(rectangle, rectangle.west+rectangle.width*fraction,
        north?rectangle.north:rectangle.south);
      assert.equal(height,-123.25, 'A collapsed pole triangle must still retain its geographic UV domain for sampleTerrain');
    }
    const poleRow=north?0:64;
    for(let col=0;col<65;col++) {
      const i=(poleRow*65+col)*2;
      const n=AttributeCompression.octDecode(tile._encodedNormals[i],tile._encodedNormals[i+1],new Cartesian3());
      assert.ok((north?n.z:-n.z)>.999, 'All longitudes meet at one stable outward pole normal');
    }
  }
});

test('polar relief normals point outward and respond to real elevation slopes', () => {
  const moon=new Ellipsoid(1737400,1737400,1737400);
  const rectangle=Rectangle.fromDegrees(0,85,.05,85.05);
  const tile=polarMesh({size:65,heightsM:Array.from({length:65*65},(_,i)=>(i%65)*5)},rectangle,moon);
  let tilted=false;
  for(let row=1;row<64;row+=7) for(let col=1;col<64;col+=7) {
    const i=(row*65+col)*2;
    const normal=AttributeCompression.octDecode(tile._encodedNormals[i],tile._encodedNormals[i+1],new Cartesian3());
    const lat=rectangle.north-row/64*rectangle.height,lon=rectangle.west+col/64*rectangle.width;
    const radial=new Cartesian3(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat));
    const dot=Cartesian3.dot(normal,radial);
    assert.ok(dot>0,'No inverted triangles or inward-facing lighting normals');
    tilted ||= dot < .99;
  }
  assert.ok(tilted,'Normals must describe relief, not merely a smooth sphere');
});


test('the first visible globe levels use pole-safe geometry rather than upstream cylindrical caps', async () => {
  const original = globalThis.fetch;
  const tilingScheme = new GeographicTilingScheme({ellipsoid:new Ellipsoid(1737400,1737400,1737400)});
  globalThis.fetch = async () => ({ok:true,json:async()=>({size:65,resolutionM:7600,heightsM:Array(65*65).fill(-1200)})});
  let upstream = 0;
  const provider=withPolarTerrain({tilingScheme,hasVertexNormals:true,getTileDataAvailable:()=>true,
    requestTileGeometry:()=>{ upstream++; throw new Error('uncorrected cap'); }});
  try {
    for (const level of [0,1,2]) for (const y of new Set([0,2**level-1])) {
      const tile=await provider.requestTileGeometry(0,y,level);
      assert.ok(tile._encodedNormals?.length>0);
      assert.ok(Cartesian3.magnitude(tile._horizonOcclusionPoint)>1,
        'A root hemisphere must never use the lunar centre as its horizon-culling point');
      const rectangle=tilingScheme.tileXYToRectangle(0,y,level);
      for (const edge of [rectangle.north,rectangle.south].filter(lat=>Math.abs(Math.abs(lat)-Math.PI/2)<1e-12))
        assert.equal(tile.interpolateHeight(rectangle,rectangle.west+rectangle.width*.37,edge),-1200);
    }
    assert.equal(upstream,0);
  } finally { provider.dispose(); globalThis.fetch=original; }
});
