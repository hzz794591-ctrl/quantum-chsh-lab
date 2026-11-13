const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const sharp=require('sharp');
const Plan=require('../measurement-core.js');
const root=path.resolve(__dirname,'..');
const output=process.env.QA_OUTPUT||path.join(root,'test-output');
fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const scope={module:{exports:{}}};
vm.runInNewContext(scripts.find(s=>s.includes('Pure numerical core')),scope);
const Core=scope.module.exports;
const ref=JSON.parse(scripts.find(s=>s.includes('documentSha256')&&s.trim().startsWith('{')));
const plain=x=>JSON.parse(JSON.stringify(x));
const close=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const config={seconds:30,gain:1,visibility:1,background:0,seed:'angles-test'};
const expected=settings=>{const p=Plan.createGroups(settings);return Core.compute(Core.expectedRows(ref,config,'theory',p),p.groups);};
const defaults=Plan.defaults(),defaultPairs=Plan.pairs();
close(expected(defaultPairs).S,2*Math.SQRT2);
close(Plan.prediction(defaults,.98).S,2*Math.SQRT2*.98);
assert.deepEqual(Plan.create().rows.map(r=>[r.a,r.b]),ref.rows.map(r=>[r.a,r.b]));
assert.deepEqual(Plan.create().groups.map(g=>g.ids),[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]]);
close(expected(Plan.pairs({A:[0,0],B:[0,0]})).S,2);
close(expected(Plan.pairs({A:[0,22.5],B:[0,-22.5]})).S,0);
for(const value of [NaN,Infinity,91,-91,'',null]){
  assert.throws(()=>Plan.validate({A:[value,0],B:[0,0]}),RangeError);
  assert.throws(()=>Plan.validateGroups([{A:value,B:0},...defaultPairs.slice(1)]),RangeError);
}
assert.throws(()=>Plan.validateGroups(defaultPairs.slice(1)),RangeError);
assert.equal(Plan.consistency(defaultPairs).valid,true);
assert.equal(Plan.consistency([{A:90,B:11.25},...defaultPairs.slice(1)]).valid,true);
assert.equal(Plan.consistency([{A:45,B:11.25},...defaultPairs.slice(1)]).valid,false);
const unrelated=[{A:0,B:0},{A:0,B:45},{A:0,B:0},{A:0,B:0}];
assert.equal(Plan.createGroups(unrelated).hwp,null);
assert.equal(Plan.predictionGroups(unrelated).chsh.valid,false);
close(expected(unrelated).S,4); // A four-correlation combination need not obey the CHSH bound.
const rng=Core.random('independent-angle-tests');
for(let i=0;i<300;i++){
  const settings={A:[rng()*180-90,rng()*180-90],B:[rng()*180-90,rng()*180-90]};
  const p=Plan.create(settings),prediction=Plan.prediction(settings);
  close(expected(Plan.pairs(settings)).S,prediction.S);
  assert.ok(prediction.S<=2*Math.SQRT2+1e-10);
  const free=Array.from({length:4},()=>({A:rng()*180-90,B:rng()*180-90}));
  close(expected(free).S,Plan.predictionGroups(free).S);
  for(const r of [...p.rows,...Plan.createGroups(free).rows]){
    close(r.a,2*r.thetaA);close(r.b,2*r.thetaB);
    // Independent Jones-amplitude check for a singlet through HWP + fixed H polarizer.
    const ca=Math.cos(2*r.thetaA*Math.PI/180),sa=Math.sin(2*r.thetaA*Math.PI/180);
    const cb=Math.cos(2*r.thetaB*Math.PI/180),sb=Math.sin(2*r.thetaB*Math.PI/180);
    close(Core.probabilities(r.a,r.b)[0],(ca*sb-sa*cb)**2/2);
  }
}
const repeated=Plan.create({A:[5,5],B:[13,13]});
const repeatedRows=Core.simulate(ref,config,'theory',repeated);
assert.equal(new Set(repeatedRows.map(r=>r.id)).size,16);
assert.ok(new Set(repeatedRows.filter(r=>r.outcome==='++').map(r=>r.raw)).size>1);
assert.ok(Core.compute(repeatedRows,repeated.groups).groups.every(g=>g.ids.length===4));
assert.notDeepEqual(Core.simulate(ref,config,'theory',Plan.create()),repeatedRows);
const baseline=Core.validateReference(ref);
close(baseline.S,2.7606045542678235);close(baseline.Sc,2.7750953071831157);
const sequentialRng=Core.random(config.seed),sequential=[];
for(let i=0;i<4;i++){
  const part={rows:repeated.rows.slice(i*4,i*4+4)};
  sequential.push(...Core.simulate(ref,config,'theory',part,sequentialRng));
  assert.throws(()=>Core.simulate(ref,config,'replay',part));
  assert.equal(Core.simulate(ref,config,'replay',{rows:Plan.create().rows.slice(i*4,i*4+4)}).length,4);
}
assert.deepEqual(sequential,repeatedRows);
for(let n=1;n<4;n++){
  const partial=Core.compute(repeatedRows.slice(0,n*4),repeated.groups.slice(0,n));
  assert.equal(partial.groups.length,n);
  assert.equal(partial.S,null);assert.equal(partial.Sc,null);
}

async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const errors=[];
 const open=async(viewport,legacy)=>{
   const context=await browser.newContext({viewport,acceptDownloads:true});
   if(legacy)await context.addInitScript(settings=>localStorage.setItem('chsh-hwp-v1',JSON.stringify(settings)),legacy);
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.join(root,'index.html')).href);
   await page.waitForFunction(()=>window.QLab&&document.querySelector('#assembly-hwp-settings'));
   return {context,page};
 };
 const measure=page=>page.evaluate(()=>QLab.getMeasurement());
 const snapshot=page=>page.evaluate(()=>QLab.getSnapshot());
 const enter=async(page,pair)=>{
   for(const arm of ['A','B']){
     await page.locator('#current-'+arm).fill(String(pair[arm]));
     await page.locator('#current-'+arm).press('Tab');
   }
   assert.equal(await page.locator('#run').isEnabled(),true);
 };
 const waitGroup=async(page,n)=>{
   await page.waitForFunction(n=>QLab.getSnapshot().session.completed===n,n);
   const s=await snapshot(page);
   assert.equal(s.session.rows.length,n*4);
   assert.equal(await page.locator('#measurement-ledger tr[data-recorded=true]').count(),n);
   if(n<4){
     assert.equal(s.status,'group-complete');assert.equal(s.data,null);
     assert.equal(await page.locator('#s-raw').innerText(),'—');
     assert.equal(await page.locator('.result-pair').isVisible(),false);
     assert.equal(await page.locator('#measurement-progress').innerText(),`已完成 ${n}/4 组，S 待计算`);
     assert.equal(await page.locator('#csv-export').isDisabled(),true);
     assert.equal(await page.evaluate(()=>QLab.startGroup()),false);
   }
   return s;
 };
 const next=async(page,i)=>{
   const recorded=(await snapshot(page)).session.rows;
   await page.locator('#next-group').click();
   const m=await measure(page);
   assert.deepEqual(m.workflow.position,m.groups[i]);
   assert.equal(m.workflow.canStart,true);
   assert.equal(await page.locator('#run').isEnabled(),true);
   assert.deepEqual((await snapshot(page)).session.rows,recorded);
   const scene=await page.evaluate(()=>Lab3D.snapshot());
   for(const arm of ['A','B'])close(scene.parts.find(p=>p.id===arm+'-hwp').mechanicalAngle,m.groups[i][arm]);
 };
 const reset=async page=>{
   await page.locator('#measurement-reset').click();
   await page.locator('#measurement-reset-dialog [value=reset]').click();
   await page.waitForFunction(()=>QLab.getSnapshot().status==='configured'&&QLab.getSnapshot().session.completed===0);
   const m=await measure(page);
   assert.deepEqual(m.workflow.position,m.groups[0]);
   assert.equal(await page.locator('.result-pair').isVisible(),false);
   assert.equal(await page.locator('#run').isEnabled(),true);
   assert.equal((await snapshot(page)).elapsed,0);
 };
 const run=async(page,actual)=>{
   await page.locator('#speed').selectOption('480');
   for(let i=0;i<4;i++){
     if(i)await next(page,i);
     if(actual)await enter(page,actual[i]);
     await page.locator('#run').click();await waitGroup(page,i+1);
   }
   const data=(await snapshot(page)).data;
   await page.locator('#results-dialog [data-close]').click();
   return data;
 };
 const exports=async(page,data)=>{
   const json=page.waitForEvent('download');await page.locator('#json-export').click();
   assert.deepEqual(JSON.parse(fs.readFileSync(await (await json).path(),'utf8')),data);
   const download=page.waitForEvent('download');await page.locator('#csv-export').click();
   const csv=fs.readFileSync(await (await download).path(),'utf8');
   for(const key of ['HWP_A_deg','planned_A_deg','actual_base_A_deg','CHSH_valid','S_model_no_background','count_origin'])assert.ok(csv.includes(key));
   assert.equal(csv.split('\r\n').length,17);
   if(!data.result.chsh.valid)assert.match(csv,/CHSH bounds not applicable/);
   const svgDownload=page.waitForEvent('download');await page.locator('[data-chart="chart-correlation"]').click();
   const svg=fs.readFileSync(await (await svgDownload).path(),'utf8');
   assert.match(svg,/<metadata>/);assert.ok(svg.includes('plannedGroups'));
 };
 try{
  const {context,page}=await open({width:1440,height:1000});
  const configured=[{A:7.125,B:-6.375},{A:16.5,B:31.25},{A:24,B:-13},{A:35,B:48}];
  await page.locator('#assembly-search').fill('A 端 半波片');
  await page.locator('[data-part="A-hwp"]').click();
  assert.equal(await page.locator('#assembly-hwp-settings').isVisible(),true);
  assert.equal(await page.locator('#assembly-hwp-settings [data-hwp-arm]').count(),8);
  for(let i=0;i<4;i++)for(const arm of ['A','B']){
    await page.locator(`#assembly-${arm}${i}`).fill(String(configured[i][arm]));
    await page.locator(`#assembly-${arm}${i}`).press('Tab');
  }
  assert.deepEqual((await measure(page)).groups,configured);
  await page.locator('#assembly-preview-group').selectOption('2');
  for(const value of ['25','26'])await page.locator('[data-slider-arm=A]').fill(value);
  close((await measure(page)).groups[2].A,26);
  close((await measure(page)).groups[1].A,16.5);
  close((await page.evaluate(()=>Lab3D.snapshot())).parts.find(p=>p.id==='A-hwp').mechanicalAngle,26);
  await page.locator('#assembly-A2').fill('24');await page.locator('#assembly-A2').press('Tab');
  await page.locator('#assembly-target').click();
  assert.ok((await page.evaluate(()=>LabAssembly.getSnapshot())).installed.includes('A-hwp'));
  await page.locator('#assembly-preview-group').selectOption('3');
  await page.screenshot({path:path.join(output,'hwp-assembly-desktop.png')});
  await page.locator('#experiment-mode').click();
  close((await page.evaluate(()=>Lab3D.snapshot())).parts.find(p=>p.id==='A-hwp').mechanicalAngle,configured[0].A);
  await page.reload();await page.waitForFunction(()=>window.QLab);
  assert.deepEqual((await measure(page)).groups,configured);
  await page.locator('#experiment-mode').click();
  assert.equal(await page.locator('#prepare-group, #target-A, #target-B, #alignment-status').count(),0);
  assert.equal((await measure(page)).workflow.target,undefined);
  assert.equal(await page.locator('#run').isEnabled(),true);
  assert.equal(await page.locator('#hwp-model-s').isVisible(),false);
  assert.equal(await page.locator('.result-pair').isVisible(),false);
  await page.locator('#hwp-presets summary').click();
  await page.locator('#measurement-settings [data-max-preset]').click();
  await page.locator('#mode').selectOption('theory');
  await page.locator('.hwp-theory summary').click();
  close(Number(await page.locator('#hwp-model-s').innerText()),2*Math.SQRT2,.00001);
  await page.screenshot({path:path.join(output,'hwp-experiment-desktop.png')});
  await page.locator('.hwp-theory summary').click();
  await page.evaluate(()=>Lab3D.select('A-hwp'));
  await page.locator('#analyzer-angle').fill('5');
  assert.equal((await measure(page)).workflow.position.A,5);
  assert.equal((await measure(page)).groups[0].A,0);
  assert.equal(await page.locator('#run').isEnabled(),true);
  await page.evaluate(()=>Lab3D.select('A-polarizer'));
  assert.equal(await page.locator('#angle-setting').isVisible(),false);
  await enter(page,defaultPairs[0]);
  // Only malformed/out-of-range inputs block acquisition, never a different valid angle.
  for(const draft of ['100','']){
    await page.locator('#current-A').fill(draft);
    assert.equal(await page.locator('#run').isDisabled(),true);
    assert.equal(await page.evaluate(()=>QLab.startGroup()),false);
    await page.evaluate(()=>QLab.setPosition('B',15));
    assert.equal((await measure(page)).workflow.invalid.A,true);
    assert.equal(await page.locator('#run').isDisabled(),true);
    await page.locator('#current-A').press('Tab');
    assert.equal(await page.locator('#current-A').inputValue(),'0');
    assert.equal(await page.locator('#run').isEnabled(),true);
  }
  await enter(page,defaultPairs[0]);
  await page.locator('#speed').selectOption('20');await page.locator('#run').click();await page.locator('#pause').click();
  assert.equal(await page.locator('#experiment-A0').isDisabled(),true);
  assert.equal(await page.evaluate(()=>QLab.setMeasurement({A:[1,2],B:[3,4]})),false);
  assert.equal(await page.evaluate(()=>QLab.setPosition('A',15)),false);
  assert.equal(await page.evaluate(()=>QLab.nextGroup()),false);
  await page.locator('#measurement-reset').click();await page.locator('#measurement-reset-dialog [value=cancel]').click();
  assert.equal((await snapshot(page)).status,'paused');
  await page.locator('#speed').selectOption('480');await page.locator('#pause').click();await waitGroup(page,1);
  const partial=await snapshot(page);await page.waitForTimeout(350);assert.deepEqual(await snapshot(page),partial);
  assert.equal(await page.locator('#mode').isDisabled(),true);
  assert.equal(await page.locator('#duration').isDisabled(),true);
  await page.locator('#measurement-progress').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'step-one-desktop.png')});
  await page.locator('#results-open').click();
  assert.equal(await page.locator('#error-body tr').count(),1);
  assert.match(await page.locator('#result-caption').innerText(),/1\/4 组，S 待计算/);
  await page.locator('#results-dialog [data-close]').click();
  for(let i=1;i<4;i++){await next(page,i);await page.locator('#run').click();await waitGroup(page,i+1);}
  const first=(await snapshot(page)).data;
  assert.deepEqual(first.metadata.config.hwp,defaults);
  assert.equal(first.result.chsh.valid,true);
  assert.ok(Math.abs(first.result.S-2*Math.SQRT2)<.05);
  close(first.result.S,Math.abs(first.result.groups.reduce((sum,g)=>sum+g.sign*g.E,0)));
  assert.deepEqual(first.metadata.measurement.acquisitions.map(g=>g.ids),[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]]);
  assert.equal(await page.locator('#measurement-progress').innerText(),'已完成 4/4 组，实验 S 已计算');
  await exports(page,first);
  await page.screenshot({path:path.join(output,'hwp-results-desktop.png')});
  await page.locator('#results-dialog [data-close]').click();await reset(page);
  assert.deepEqual((await measure(page)).groups,defaultPairs);

  // Four independent planned pairs, with further edits immediately before each acquisition.
  await page.evaluate(p=>QLab.setMeasurement(p),configured);
  const actual=[{A:3,B:5},{A:-12,B:27},{A:31,B:-17},{A:8,B:44}];
  const custom=await run(page,actual);
  assert.deepEqual(custom.metadata.measurement.plannedGroups,configured);
  assert.deepEqual(custom.metadata.measurement.groupAngles,actual);
  assert.deepEqual(custom.result.groups.map(g=>({A:g.thetaA,B:g.thetaB})),actual);
  assert.equal(custom.metadata.config.hwp,null);assert.equal(custom.result.chsh.valid,false);
  close(custom.metadata.measurement.prediction.S,Plan.predictionGroups(actual,custom.metadata.config.visibility).S);
  const generated=Core.simulate(ref,custom.metadata.config,'theory',Plan.createGroups(actual));
  assert.deepEqual(custom.rows.map(r=>[r.id,r.thetaA,r.thetaB,r.raw,r.control]),plain(generated.map(r=>[r.id,r.thetaA,r.thetaB,r.raw,r.control])));
  assert.notDeepEqual(custom.rows.map(r=>r.raw),first.rows.map(r=>r.raw));
  assert.equal(await page.locator('#chsh-status').isVisible(),true);
  assert.match(await page.locator('#chsh-status').innerText(),/非 CHSH/);
  await page.locator('#results-open').click();
  assert.match(await page.locator('#result-caption').innerText(),/非 CHSH/);
  assert.equal(await page.locator('#chart-correlation [data-help=classic], #chart-correlation [data-help=quantum]').count(),0);
  const labels=await page.locator('#chart-correlation [data-group][data-help=Eraw] text, #chart-correlation [data-group][data-help=Ecorr] text').evaluateAll(nodes=>nodes.map(el=>el.getBBox().y+el.getBBox().height));
  assert.equal(labels.length,8);assert.ok(labels.every(bottom=>bottom<240),'E labels must not overlap angle coordinates');
  assert.match(await page.locator('#summary-body').innerText(),/本次不适用/);
  assert.equal(await page.locator('#chart-heatmap [data-help=N]').count(),16);
  assert.equal(new Set(await page.locator('#chart-heatmap [data-help=N]').evaluateAll(nodes=>nodes.map(n=>n.dataset.row))).size,16);
  assert.doesNotMatch(await page.locator('#chart-heatmap').innerHTML(),/NaN|undefined/);
  await exports(page,custom);
  await page.screenshot({path:path.join(output,'free-angle-results-desktop.png')});
  await page.locator('#results-dialog [data-close]').click();
  await page.locator('#measurement-progress').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'step-complete-desktop.png')});
  await reset(page);assert.deepEqual((await measure(page)).groups,configured);
  assert.deepEqual((await run(page,actual)).rows,custom.rows);
  await reset(page);
  await page.locator('#experiment-A0').fill('100');await page.locator('#experiment-A0').press('Tab');
  assert.equal(await page.locator('#experiment-A0').inputValue(),String(configured[0].A));
  await page.evaluate(()=>QLab.setMeasurement({A:[5,5],B:[13,13]}));
  const equal=await run(page);
  assert.equal(equal.result.chsh.valid,true);
  assert.equal(new Set(equal.rows.map(r=>r.id)).size,16);
  assert.ok(new Set(equal.result.groups.map(g=>g.E)).size>1);
  await reset(page);
  const validCustom=Plan.pairs({A:[-7,19],B:[3,42]});
  await page.evaluate(p=>QLab.setMeasurement(p),validCustom);
  const valid=await run(page);assert.equal(valid.result.chsh.valid,true);
  assert.ok(Math.abs(valid.result.S-Plan.predictionGroups(validCustom).S)<.05);
  await reset(page);await page.evaluate(p=>QLab.setMeasurement(p),defaultPairs);
  await page.locator('#mode').selectOption('replay');
  const replay=await run(page);close(replay.result.S,baseline.S);close(replay.result.Sc,baseline.Sc);
  assert.ok(replay.rows.every(r=>r.origin==='reference'));
  await reset(page);
  const mixedPairs=defaultPairs.map((p,i)=>i===1?{A:9,B:21}:p);
  const mixed=await run(page,mixedPairs);
  assert.equal(mixed.metadata.kind,'mixed-reference-and-simulation');
  assert.deepEqual(mixed.metadata.measurement.acquisitions.map(g=>g.origin),['reference','simulated','reference','reference']);
  assert.deepEqual(mixed.rows.slice(0,4),replay.rows.slice(0,4));
  assert.notDeepEqual(mixed.rows.slice(4,8).map(r=>r.raw),replay.rows.slice(4,8).map(r=>r.raw));
  assert.equal(mixed.rows[4].thetaA,9);assert.equal(mixed.rows[4].thetaB,21);
  await reset(page);
  await page.locator('#speed').selectOption('20');await page.locator('#run').click();await page.locator('#pause').click();
  await reset(page);await page.waitForTimeout(200);assert.equal((await snapshot(page)).session.rows.length,0);
  assert.ok((await page.evaluate(()=>LabAssembly.getSnapshot())).installed.includes('A-hwp'));
  await context.close();

  const legacy={A:[3,18],B:[9,36]},migrated=await open({width:1024,height:768},legacy);
  assert.deepEqual((await measure(migrated.page)).groups,Plan.pairs(legacy));
  await migrated.context.close();
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:844,height:390},{width:1024,height:768}]){
    const {context,page}=await open(viewport);
    await page.locator('#assembly-search').fill('B 端 半波片');await page.locator('[data-part="B-hwp"]').click();
    await page.locator('#assembly-B0').fill('12.34');await page.locator('#assembly-B0').press('Tab');
    await page.locator('#assembly-A3').fill('17');await page.locator('#assembly-A3').press('Tab');
    await page.locator('#assembly-B0').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const selector of ['#assembly-A0','#assembly-B0','#assembly-A3','#assembly-B3']){
      const b=await page.locator(selector).boundingBox();assert.ok(b.width>=40&&b.x>=0&&b.x+b.width<=viewport.width);
    }
    await page.screenshot({path:path.join(output,`hwp-assembly-${viewport.width}.png`)});
    const canvas=await page.locator('#viewport canvas').screenshot();
    const stats=await sharp(canvas).stats();assert.ok(stats.channels[0].stdev>10);
    await page.locator('#experiment-mode').click();
    const compact=viewport.width<=760||viewport.height<=560;
    assert.equal(await page.locator('#measurement-records').evaluate(el=>el.open),!compact);
    const header=await page.locator('.topbar').boundingBox(),title=await page.locator('.scene-title').boundingBox();
    assert.ok(header.y+header.height<=title.y,'Navigation overlaps scene title');
    await page.locator('#hwp-presets summary').click();await page.locator('#experiment-B0').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#experiment-B0').inputValue(),'12.34');
    assert.equal(await page.locator('#experiment-A3').inputValue(),'17');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,`hwp-experiment-${viewport.width}.png`)});
    await page.locator('#hwp-presets summary').click();await page.locator('#speed').selectOption('480');
    await page.locator('#run').click();await waitGroup(page,1);
    await page.locator('#measurement-progress').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`step-one-${viewport.width}.png`)});
    if(compact){
      assert.match(await page.locator('#latest-e').innerText(),/^E1 = -?0\.\d+/);
      await page.locator('#measurement-records summary').click();assert.equal(await page.locator('#measurement-ledger').isVisible(),true);
      await page.locator('#measurement-records summary').click();
    }
    assert.equal(await page.locator('#measurement-workflow').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await next(page,1);await page.locator('#current-A').scrollIntoViewIfNeeded();
    for(const selector of ['#current-A','#current-B']){
      const b=await page.locator(selector).boundingBox();assert.ok(b.width>=40&&b.x>=0&&b.x+b.width<=viewport.width);
    }
    await page.locator('input[type=range][data-position-arm=A]').fill('7');
    assert.equal(await page.locator('#run').isEnabled(),true);
    await page.screenshot({path:path.join(output,`step-controls-${viewport.width}.png`)});
    for(let i=1;i<4;i++){
      if(i>1)await next(page,i);
      await page.locator('#run').click();await waitGroup(page,i+1);
    }
    assert.equal((await snapshot(page)).data.result.chsh.valid,false);
    await page.locator('#results-dialog [data-close]').click();
    await page.locator('#measurement-progress').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`step-complete-${viewport.width}.png`)});
    assert.equal(await page.locator('#measurement-workflow').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,jonesAndPlanChecks:300,independentPairChecks:300,idealS:Plan.prediction(defaults).S,defaultSampleS:first.result.S,freeAngleCombination:custom.result.S,replayS:baseline.S,screenshots:output},null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
