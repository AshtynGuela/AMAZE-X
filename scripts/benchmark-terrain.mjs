import fs from 'node:fs/promises';
const base=(process.env.BASE_URL??'http://127.0.0.1:5175').replace(/\/$/,''),lat=Number(process.env.TERRAIN_LAT??'89.81372'),lon=Number(process.env.TERRAIN_LON??'41.23819'),quality=process.env.TERRAIN_QUALITY??'quick';
const url=base+'/api/terrain?'+new URLSearchParams({lat:String(lat),lon:String(lon),quality});
const started=performance.now(),statuses=[];let ready,error;
try {
  while(performance.now()-started<180000) {
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});statuses.push(response.status);const body=await response.json();
    if(response.status===200&&!body.pending){ready=body;break}
    if(response.status!==202)throw Error(body.error??'Unexpected HTTP '+response.status);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('No ready result within the three-minute benchmark');
} catch(e){error=e.message}
const readyMs=performance.now()-started;let warmMs;
if(ready){const t=performance.now();const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(r.status===200&&!((await r.json()).pending))warmMs=performance.now()-t;}
const report={testedUtc:new Date().toISOString(),base,lat,lon,requestedQuality:quality,scope:'First request for this coordinate in this run; existing service and raster caches retained. HTTP 202 never counted as ready.',passed:!!ready,error,readyMs:ready?readyMs:null,warmMs,pendingResponses:statuses.filter(s=>s===202).length,statuses:[...new Set(statuses)],quality:ready?.quality,rays:ready?.masks?.['2']?.length,resolutionM:ready?.resolutionM,calculationSeconds:ready?.calculationSeconds};
await fs.writeFile(process.env.TERRAIN_REPORT??'data/validation/terrain-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!ready)process.exitCode=1;
