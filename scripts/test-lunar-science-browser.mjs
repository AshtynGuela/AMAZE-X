import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { encodeSession } from '../src/share.mjs';
const base=(process.env.BASE_URL??'http://127.0.0.1:5175').replace(/\/$/,''),root='data/validation/ui-eclipse-export',shots='.impeccable/review/lunar-science';
await fs.mkdir(root,{recursive:true});await fs.mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],state={scenarios:['apollo11','im1'].map((siteId,i)=>({id:i?'B':'A',siteId,epoch:'2025-03-14T00:00:00.000Z',durationDays:1,arrayMode:'tracking',arrayAzimuth:0})),custom:[],mastM:2,minAntennaEl:5,time:Date.parse('2025-03-14T07:00Z'),selected:'apollo11',view:'globe',mode:'plain',activeScenarioId:'A'};
async function setup(page){
  page.on('pageerror',e=>{if(e.message!=='Could not load /assets/rocky-web.glb: Failed to fetch')errors.push(e.message)});
  // Actual model fidelity, animations and dragging run separately via
  // test:rocky-motion-browser. No unexpected errors are filtered here.
  await page.route('**/assets/rocky-web.glb',route=>route.abort());
  await page.goto(base+'/?session='+encodeURIComponent(encodeSession(state)));
  await page.getByRole('dialog',{name:'AMAZE-X',exact:true}).press('Escape');
}
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
try {
  await setup(page);
  await expect(page.locator('.compare-column')).toHaveCount(2);
  for(const column of await page.locator('.comparison-values').all())await expect(column).not.toContainText('Loading',{timeout:120000});
  const takeaway=await page.locator('.comparison-takeaway').innerText();assert.ok(!/calculating|loading/i.test(takeaway));
  await page.getByRole('button',{name:'Close comparison'}).click();
  await expect(page.locator('.eclipse-status')).toContainText('total',{timeout:120000});
  const readings=await page.locator('.condition-reading > strong').allTextContents();
  await page.getByRole('button',{name:'Plain',exact:true}).click();
  await expect(page.locator('.engineering-readings')).toBeVisible();
  assert.deepEqual(await page.locator('.condition-reading > strong').allTextContents(),readings);
  await page.getByRole('button',{name:'Engineer',exact:true}).click();
  async function download(format,name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export data as '+format.toUpperCase(),exact:true}).click();await(await event).saveAs(root+'/'+name);return fs.readFile(root+'/'+name,'utf8')}
  const report=JSON.parse(await download('json','eclipse.json')),csv=await download('csv','eclipse.csv');
  assert.equal(report.application,'AMAZE-X');assert.equal(report.current.epochUtc,'2025-03-14T07:00:00.000Z');assert.equal(report.current.values.powerIndex,0);
  assert.ok(report.mission.metrics.meanPowerIndex>0);assert.ok(report.mission.metrics.eclipseHours>1);
  assert.ok(report.sources.some(s=>s.name==='NASA/JPL Horizons'&&s.sha256.length===64));
  assert.ok(csv.includes('"current","power_index","0"'));
  await page.getByRole('button',{name:'Time',exact:true}).click();
  const clock=page.getByLabel('Date and Time (UTC)',{exact:true});await clock.fill('2025-03-14T12:00');await clock.blur();
  await expect(page.locator('.eclipse-status')).toContainText('none');
  const after=JSON.parse(await download('json','after-eclipse.json'));
  assert.equal(after.current.epochUtc,'2025-03-14T12:00:00.000Z');assert.ok(after.current.values.powerIndex>0);
  assert.equal(after.mission.startUtc,report.mission.startUtc);assert.equal(after.mission.metrics.meanPowerIndex,report.mission.metrics.meanPowerIndex);
  // Keyboard: focus enters the planner, wraps inside it, Escape closes it,
  // and focus returns to the exact control that opened it.
  const trigger=page.getByRole('button',{name:'Plan landing',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Plan a landing',exact:true});await expect(dialog).toBeVisible({timeout:30000});
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
  const focusable=dialog.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary').filter({visible:true});
  await focusable.last().focus();await page.keyboard.press('Tab');await expect(focusable.first()).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.getByRole('button',{name:'Sites',exact:true}).click();
  if(process.env.CAPTURE_UI==='1')await page.screenshot({path:shots+'/desktop.png',animations:'disabled',timeout:45000});
  // One browser and one map at a time; resizing exercises the shipped layout.
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Show inspector',exact:true}).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.eclipse-status')).toContainText('none');
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(mobile.width,mobile.scrollWidth);
  if(process.env.CAPTURE_UI==='1')await page.screenshot({path:shots+'/mobile.png',animations:'disabled',timeout:45000});
  await page.getByRole('button',{name:'Close details',exact:true}).click();await expect(page.locator('.inspector')).not.toBeVisible();
  assert.deepEqual(errors,[]);
  const result={testedUtc:new Date().toISOString(),base,realApi:true,rockyRenderingExcluded:true,twoSiteComparison:takeaway,zeroDirectPowerInTotality:true,modesPreserveReadings:true,csvAndJsonDownloaded:true,missionTimeBasisPreserved:true,keyboardPlanner:{focusEntry:true,tabWrap:true,escape:true,focusRestored:true},mobileInspectorOpenClose:true,mobile,visualCaptures:process.env.CAPTURE_UI==='1',physicalPhoneTested:false,errors};
  await fs.writeFile('data/validation/lunar-science-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close()}
