import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { answerQuestion } from '../server/assistant.mjs';
import { ephemeris } from '../server/horizons.mjs';

const root=new URL('../',import.meta.url),sites=JSON.parse(await fs.readFile(new URL('data/sites.json',root),'utf8'));
const help=process.env.ASSISTANT_CASE==='help';
const input={question:help?'How do I compare two lunar landing sites in this app? Explain the steps only; do not change app settings.':'Compare Apollo 12 and IM-1 for a one-day surface stay starting 2026-11-20T00:00:00Z. Use calculated values, and do not change app settings.',mode:'plain',context:{selectedSiteId:'im1',timeUtc:'2026-11-20T00:00:00.000Z',mastM:2,minAntennaEl:5,view:'globe',scenarios:[]},history:[]};
const events=[],started=performance.now();let result,error;
try {
  result=await answerQuestion(input,{
    sites,signal:AbortSignal.timeout(90000),
    loadTerrain:site=>fs.readFile(new URL('public/data/'+site.id+'.json',root),'utf8').then(JSON.parse),
    loadData:({site,iso,days,mast,terrain})=>ephemeris({lat:site.lat,lon:site.lon,elevationM:terrain.elevationM+mast,start:iso,days}),
    trace:event=>events.push(event.event==='model'?{event:'model',model:event.model,toolNames:event.message.tool_calls?.map(call=>call.function.name),reply:event.message.content}:event),
  });
  if(help){
    assert.match(result.speech,/Plan landing/i);assert.match(result.speech,/Add to comparison/i);
    assert.ok(!/run (?:the )?comparison/i.test(result.speech),'Invented comparison control');
  } else {
    assert.ok(result.evidence.some(f=>f.value==='Apollo 12'));
    assert.ok(result.evidence.some(f=>/Odysseus|IM-1/.test(f.value)));
    for(const id of ['apollo12','im1']){
    assert.ok(result.evidence.some(f=>f.siteId===id&&f.label==='Sunlight during stay'&&f.unit==='h'),'Calculated sunlight evidence missing for '+id);
    assert.ok(result.evidence.some(f=>f.siteId===id&&f.label==='Earth above terrain during stay'&&f.unit==='h'),'Calculated Earth-visibility evidence missing for '+id);
    }
  }
  assert.equal(result.actions.length,0,'Explanatory comparison must not change app settings');
} catch(e) {error=e.message;}
const report={testedUtc:new Date().toISOString(),question:input.question,elapsedMs:performance.now()-started,passed:!error,result,error,events};
const output=process.env.ASSISTANT_REPORT??('data/validation/assistant-'+(help?'help':'comparison')+'-live.json');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,elapsedMs:report.elapsedMs,model:result?.model,speech:result?.speech,evidenceCount:result?.evidence?.length,error,events}));
if(error)process.exitCode=1;
