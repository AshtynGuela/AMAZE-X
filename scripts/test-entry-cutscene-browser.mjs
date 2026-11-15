import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL??'http://127.0.0.1:5175';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[],phases=new Set();
page.on('pageerror',e=>{if(e.message!=='Could not load /assets/rocky-web.glb: Failed to fetch')errors.push(e.message)});
try{
  await page.route('**/assets/rocky-web.glb',route=>route.abort());
  await page.goto(base);await page.waitForFunction(()=>document.activeElement?.matches('.mission-welcome'));
  await page.evaluate(()=>{
    window.cutsceneTrace=[];
    new MutationObserver(()=>{
      const root=document.querySelector('main'),value=root?.getAttribute('data-entry-progress');
      if(value)window.cutsceneTrace.push({progress:Number(value),phase:document.querySelector('.welcome-flight')?.dataset.phase});
    }).observe(document.querySelector('main'),{attributes:true,attributeFilter:['data-entry-progress']});
  });
  await page.mouse.move(350,300);await page.mouse.wheel(0,-120);
  await expect(page.locator('.welcome-cutscene-stars')).toHaveCount(1);
  await expect(page.locator('.welcome-flight')).toHaveAttribute('data-state','ready',{timeout:60000});
  await expect.poll(()=>page.evaluate(()=>Math.max(0,...window.cutsceneTrace.map(row=>row.progress))),{timeout:15000}).toBeGreaterThan(.15);
  await fs.mkdir('.impeccable/review/entry-cutscene',{recursive:true});
  if(process.env.CAPTURE_UI==='1')await page.screenshot({path:'.impeccable/review/entry-cutscene/launch.png',animations:'disabled',timeout:30000});
  await expect(page.locator('.mission-welcome')).toHaveCount(0,{timeout:30000});
  const trace=await page.evaluate(()=>window.cutsceneTrace);
  trace.forEach(row=>{if(row.phase)phases.add(row.phase)});
  if(process.env.CAPTURE_UI==='1')await page.screenshot({path:'.impeccable/review/entry-cutscene/completed.png',animations:'disabled',timeout:30000});
  await expect(page.locator('.welcome-flight,.welcome-cutscene-stars')).toHaveCount(0);
  assert.ok(await page.locator('.view-toolbar').evaluate(el=>!el.closest('[inert]')));
  await page.close();
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),requests=[];
  reduced.on('request',r=>{if(r.url().includes('/assets/entry/'))requests.push(r.url())});
  await reduced.goto(base);await reduced.waitForFunction(()=>document.activeElement?.matches('.mission-welcome'));
  await reduced.mouse.click(30,30);
  await expect(reduced.locator('.mission-welcome')).toHaveCount(0,{timeout:60000});
  assert.equal(requests.length,0);assert.deepEqual(errors,[]);
  const report={testedUtc:new Date().toISOString(),base,automaticAfterSingleScroll:true,starBackdrop:true,phases:[...phases],mapControlsRestored:true,overlayRemoved:true,clickEntry:true,reducedMotionSkipsModels:true,rockyRenderingExcluded:true,timing:'Real browser clock; actual supplied rocket/spacecraft models rendered',errors};
  await fs.writeFile('data/validation/entry-cutscene-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
