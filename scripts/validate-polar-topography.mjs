import assert from "node:assert/strict";
import fs from "node:fs/promises";
const origin = process.env.BASE_URL || "http://127.0.0.1:5175";
const report = { origin, checkedUtc: new Date().toISOString(), tiles: [], profiles: [] };
async function read(url) {
  const start = performance.now(), response = await fetch(origin + url);
  assert.equal(response.status, 200, `${url}: ${response.status}`);
  return { data: await response.json(), responseMs: +(performance.now()-start).toFixed(2) };
}
let north;
for (const [name, y, row] of [["north", 0, 0], ["south", 4095, 64]]) {
  const {data, responseMs} = await read(`/api/polar-terrain/12/4096/${y}`);
  assert.equal(data.size, 65); assert.equal(data.heightsM.length, 4225);
  assert.ok(data.heightsM.every(Number.isFinite));
  const pole = data.heightsM.slice(row*65, (row+1)*65);
  assert.equal(Math.max(...pole)-Math.min(...pole), 0);
  report.tiles.push({name, responseMs, resolutionM:data.resolutionM, poleHeightM:pole[0], poleSpreadM:0,
    sources:data.sources.map(source=>source.product)});
  if (name === "north") north = data;
}
const adjacent = (await read("/api/polar-terrain/12/4097/0")).data;
const edgeError = Math.max(...Array.from({length:65}, (_,row)=>Math.abs(north.heightsM[row*65+64]-adjacent.heightsM[row*65])));
assert.ok(edgeError <= .002); report.sharedEdgeMaxErrorM = edgeError;
for (const quality of ["quick", "full"]) {
  const {data, responseMs} = await read(`/api/terrain?lat=89.9&lon=40&quality=${quality}`);
  assert.equal(data.quality, quality); assert.equal(data.masks["2"].length, quality === "quick" ? 180 : 720);
  let maxError = 0;
  for (const mast of [0,2,5,10]) {
    const obs = data.obstructions[String(mast)];
    for (let i=0;i<obs.distanceM.length;i++) {
      const theta=obs.distanceM[i]/1737400;
      const radial=1737400+obs.elevationM[i];
      const reconstructed=Math.atan2(radial*Math.cos(theta)-1737400-data.elevationM-mast,
        radial*Math.sin(theta))*180/Math.PI;
      maxError=Math.max(maxError,Math.abs(reconstructed-data.masks[String(mast)][i]));
    }
  }
  assert.ok(maxError < .02); // Stored obstruction heights are rounded to 1 cm.
  report.profiles.push({quality,responseMs,calculationSeconds:data.calculationSeconds,rays:data.masks["2"].length,
    elevationM:data.elevationM,maxReconstructedAngleErrorDeg:maxError});
}
await fs.writeFile("data/validation/polar-topography.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
