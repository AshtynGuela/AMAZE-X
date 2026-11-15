import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonIntent } from '../server/comparison-intent.mjs';
import { answerQuestion, groundExactFactCopies, materializeAnswer } from '../server/assistant.mjs';
const sites=[{id:'im1',name:'Odysseus · IM-1',lat:-80,lon:0},{id:'apollo12',name:'Apollo 12',lat:-3,lon:-23}];
const question='Compare Apollo 12 and IM-1 for a one-day surface stay starting 2026-11-20T00:00:00Z. Use calculated values, and do not change app settings.';

test('explicit comparisons preserve site order and user duration; ambiguous dates are not guessed',()=>{
  assert.deepEqual(comparisonIntent({question},sites),{siteIds:['apollo12','im1'],durationDays:1,iso:'2026-11-20T00:00:00.000Z',readOnly:true});
  assert.equal(comparisonIntent({question:'Compare Apollo 12 and IM-1 for one day at 2026-11-20T00:00:00Z, then open the Moon.'},sites).readOnly,false);
  assert.equal(comparisonIntent({question:'How do I compare sites?'},sites),null);
  assert.equal(comparisonIntent({question:'Compare Apollo 12 and IM-1',context:{timeUtc:'2026-11-20T00:00:00Z'}},sites),null);
  assert.equal(comparisonIntent({question:'Compare Apollo 12 and IM-1 for one day on 2026-11-21',context:{timeUtc:'2026-11-20T00:00:00Z'}},sites),null);
});

test('verified dates and catalogue aliases survive sentence punctuation without accepting new numbers',()=>{
  const facts=[{id:'f1',label:'Start',value:'2026-11-20T00:00:00.000Z',unit:''},{id:'f2',label:'Site',value:'Odysseus · IM-1',unit:''},{id:'f3',label:'Site',value:'Apollo 12',unit:''}];
  const raw={speech:'Odysseus IM-1 and Apollo 12. Start 2026-11-20T00:00:00Z.',details:'',evidenceIds:[],actions:[]};
  const result=materializeAnswer(groundExactFactCopies(raw,facts),facts);
  assert.equal(result.speech,'Odysseus · IM-1 and Apollo 12. Start 2026-11-20T00:00:00.000Z.');
  assert.throws(()=>materializeAnswer(groundExactFactCopies({...raw,speech:'Apollo 120.'},facts),facts),/placeholders/);
});

test('comparison calculates both sites before provider prose and returns site-scoped evidence without actions',async()=>{
  const fetchBefore=globalThis.fetch,keys={OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,GROQ_API_KEY:process.env.GROQ_API_KEY};
  process.env.OPENROUTER_API_KEY='fixture-only';delete process.env.GROQ_API_KEY;
  const read=[];const DAY=86400000;
  try {
    globalThis.fetch=async(_url,options)=>{
      const request=JSON.parse(options.body);assert.equal(request.tools,undefined);
      const facts=JSON.parse(request.messages.findLast(m=>m.content?.startsWith('Verified evidence: ')).content.slice('Verified evidence: '.length));
      const used=facts.filter(f=>f.siteId&&['Site','Sunlight during stay','Earth above terrain during stay'].includes(f.label));
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({speech:used.map(f=>'{{'+f.id+'}}').join('. '),details:'',evidenceIds:used.map(f=>f.id),actions:[]})}}]})};
    };
    const result=await answerQuestion({question,context:{mastM:2,minAntennaEl:5}}, {
      sites,signal:AbortSignal.timeout(5000),loadTerrain:async()=>({elevationM:0,masks:{'2':Array(720).fill(0)}}),
      loadData:async({site,iso})=>{read.push(site.id);const start=Date.parse(iso),el=site.id==='apollo12'?20:-20;return {sun:[[start,90,el,1920,149597870.7],[start+33*DAY,90,el,1920,149597870.7]],earth:[[start,0,el,6800,380000],[start+33*DAY,0,el,6800,380000]]};},
    });
    assert.deepEqual(read.sort(),['apollo12','im1']);assert.deepEqual(result.actions,[]);
    for(const [siteId,hours]of[['apollo12','24.00'],['im1','0.00']]){
      assert.equal(result.evidence.find(f=>f.siteId===siteId&&f.label==='Sunlight during stay').value,hours);
      assert.equal(result.evidence.find(f=>f.siteId===siteId&&f.label==='Earth above terrain during stay').value,hours);
    }
  } finally {globalThis.fetch=fetchBefore;for(const [key,value]of Object.entries(keys)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
