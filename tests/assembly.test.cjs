/* Run with Playwright available via NODE_PATH; optionally set BROWSER_PATH. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname,'..');
const url = pathToFileURL(path.join(root,'index.html')).href;
const output = process.env.QA_OUTPUT || path.join(root,'test-output');
const partCount = 27;
fs.mkdirSync(output,{recursive:true});

async function main() {
  const browser = await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
  const errors=[];
  const open=async(viewport,installed)=>{
    const context=await browser.newContext({viewport});
    if(installed) await context.addInitScript(ids=>localStorage.setItem('chsh-assembly-v1',JSON.stringify({version:1,installed:ids})),installed);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(()=>window.LabAssembly && window.Lab3D);
    await page.waitForTimeout(150);
    return {context,page};
  };
  try {
    const {context,page}=await open({width:1440,height:1000});
    const snapshot=()=>page.evaluate(()=>LabAssembly.getSnapshot());
    assert.equal((await snapshot()).total,partCount);
    const layout=await page.evaluate(()=>Lab3D.snapshot());
    const input=layout.parts.find(p=>p.id==='pump-hwp-input');
    const qwp=layout.parts.find(p=>p.id==='pump-qwp');
    assert.equal(layout.parts[2].id,input.id);
    assert.equal(layout.parts[5].id,qwp.id);
    assert.equal(input.kind,'round');
    assert.equal(input.kind,qwp.kind);
    assert.match(input.name,/半波片/);
    assert.deepEqual(input.position,[-1.28,0,-3.08]);
    assert.deepEqual(input.rotation,[0,Math.PI/2,0]);
    const left=layout.parts.find(p=>p.id==='counter');
    const right=layout.parts.find(p=>p.id==='counter-B');
    assert.deepEqual(left.position,[-8.3,0,-.7]);
    assert.deepEqual(right.position,[8.3,0,-.7]);
    assert.equal(left.kind,right.kind);
    assert.equal(layout.wires.length,3,'Only the laser cable and two side-counter cables remain');
    assert.ok(layout.wires.every(w=>!w.visible));
    assert.ok(layout.wires.every(w=>w.points.every(p=>p[2]<=1.48)),'No cable extends across the front of the table');
    assert.deepEqual(layout.wires[1].points.map(([x,y,z])=>[-x,y,z]),layout.wires[2].points);
    assert.deepEqual(await page.evaluate(()=>LabAssemblyScene.snapshot().visible),[]);
    assert.equal(await page.locator('.assembly-item').count(),9);
    assert.match(await page.locator('#assembly-role').innerText(),/泵浦光/);
    await page.screenshot({path:path.join(output,'desktop-library.png')});
    await page.locator('[data-part="bbo"]').click();
    assert.match(await page.locator('#assembly-role').innerText(),/不可区分性/);
    assert.equal((await snapshot()).current,'bbo');
    await page.screenshot({path:path.join(output,'desktop-bbo.png')});
    // A wrong slot cannot install the selected component.
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('assembly-slot',{detail:'laser'})));
    assert.equal((await snapshot()).installed.length,0);
    assert.match(await page.locator('#assembly-feedback').innerText(),/不匹配/);
    await page.locator('#assembly-target').click();
    assert.deepEqual((await snapshot()).installed,['bbo']);
    await page.locator('#assembly-remove').click();
    assert.equal((await snapshot()).installed.length,0);
    await page.locator('#assembly-target').click();
    await page.reload();
    await page.waitForFunction(()=>window.LabAssembly);
    assert.deepEqual((await snapshot()).installed,['bbo']);
    await page.locator('#assembly-reset').click();
    await page.locator('#assembly-reset-dialog button[value=cancel]').click();
    assert.equal((await snapshot()).installed.length,1);
    await page.locator('#assembly-reset').click();
    await page.locator('#assembly-reset-dialog button[value=reset]').click();
    await page.waitForFunction(()=>LabAssembly.getSnapshot().installed.length===0);
    assert.equal((await snapshot()).installed.length,0);
    await page.locator('#assembly-search').fill('不存在的器件');
    assert.equal(await page.locator('.assembly-item').count(),0);
    await page.locator('#assembly-search').fill('BBO');
    assert.equal(await page.locator('.assembly-item').count(),1);
    await page.locator('#assembly-search').fill('');
    await page.locator('[data-part="laser"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('clean')),false);
    // Install every part via the rendered mount button and next-item control.
    for(let i=0;i<partCount;i++) {
      await page.locator('#assembly-target').click();
      assert.equal((await snapshot()).installed.length,i+1);
      if(i<partCount-1) await page.locator('#assembly-detail-next').click();
    }
    assert.equal(await page.locator('#assembly-continue').isEnabled(),true);
    assert.equal((await page.evaluate(()=>LabAssemblyScene.snapshot())).visible.length,partCount);
    assert.ok((await page.evaluate(()=>Lab3D.snapshot())).wires.every(w=>w.visible));
    assert.equal((await snapshot()).current,'counter-B');
    assert.match(await page.locator('#assembly-role').innerText(),/符合事件/);
    await page.locator('#assembly-remove').click();
    assert.equal((await snapshot()).installed.length,partCount-1);
    assert.ok((await snapshot()).installed.includes('counter'));
    assert.ok(!(await page.evaluate(()=>LabAssemblyScene.snapshot())).visible.includes('counter-B'));
    assert.ok((await page.evaluate(()=>Lab3D.snapshot())).wires.every(w=>!w.visible));
    await page.locator('#assembly-target').click();
    await page.reload();
    await page.waitForFunction(()=>window.LabAssembly && window.Lab3D);
    assert.equal((await snapshot()).installed.length,partCount);
    await page.locator('[data-assembly-view=overview]').click();
    await page.screenshot({path:path.join(output,'desktop-complete.png')});
    await page.locator('#assembly-continue').click();
    assert.equal((await snapshot()).active,false);
    assert.equal(await page.locator('.instrument-panel').isVisible(),true);
    // Exercise the existing run/pause/complete flow and data provenance in every mode.
    for(const mode of ['replay','calibrated','theory']) {
      await page.evaluate(()=>QLab.resetMeasurement());
      await page.locator('#mode').selectOption(mode);
      await page.locator('#speed').selectOption('20');
      assert.equal(await page.locator('#run').isEnabled(),true);
      await page.locator('#run').click();
      await page.locator('#pause').click();
      assert.equal(await page.evaluate(()=>QLab.getSnapshot().status),'paused');
      await page.locator('#assembly-mode').click();
      assert.equal((await snapshot()).active,false);
      await page.locator('#speed').selectOption('480');
      await page.locator('#pause').click();
      await page.waitForFunction(()=>QLab.getSnapshot().status==='group-complete');
      for(let i=1;i<4;i++){
        await page.locator('#next-group').click();
        assert.equal(await page.locator('#run').isEnabled(),true);
        await page.locator('#run').click();
        await page.waitForFunction(n=>QLab.getSnapshot().session.completed===n,i+1);
      }
      const run=await page.evaluate(()=>QLab.getSnapshot());
      assert.equal(run.data.rows.length,16);
      assert.ok(Number.isFinite(run.data.result.S));
      if(mode==='replay') {
        const ref=await page.evaluate(()=>QLab.referenceSummary);
        assert.equal(run.data.result.S,ref.S);
        assert.equal(run.data.result.Sc,ref.Sc);
      }
      await page.locator('#results-dialog [data-close]').click();
    }
    await page.locator('#assembly-mode').click();
    assert.equal((await snapshot()).installed.length,partCount);
    await context.close();

    // Existing completed assemblies keep all old parts and only lack the new counter.
    const legacyIds=layout.parts.filter(p=>p.id!=='counter-B').map(p=>p.id);
    const legacy=await open({width:1440,height:1000},legacyIds);
    assert.deepEqual((await legacy.page.evaluate(()=>LabAssembly.getSnapshot())).installed,legacyIds);
    assert.equal(await legacy.page.locator('#assembly-continue').isEnabled(),false);
    assert.equal((await legacy.page.evaluate(()=>LabAssembly.getSnapshot())).current,'counter-B');
    await legacy.page.locator('#assembly-target').click();
    assert.equal(await legacy.page.locator('#assembly-continue').isEnabled(),true);
    await legacy.context.close();

    for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1024,height:768},{width:844,height:390}]) {
      const {page,context}=await open(viewport);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('[data-part="laser"]').click();
      await page.locator('#assembly-target').click();
      await page.locator('#assembly-detail-next').click();
      await page.locator('#assembly-target').waitFor({state:'visible'});
      assert.equal(await page.locator('#assembly-target').isVisible(),true);
      // Mount guidance should be above the bottom sheet, never hidden beneath it.
      const target=await page.locator('#assembly-target').boundingBox();
      const detail=await page.locator('.assembly-detail').boundingBox();
      const bottomSheet=viewport.width<900&&viewport.height>560;
      if(bottomSheet) assert.ok(target.y+target.height<detail.y);
      else {
        assert.equal(await page.locator('.assembly-library').isVisible(),true);
        const library=await page.locator('.assembly-library').boundingBox();
        assert.ok(target.x>library.x+library.width);
        assert.ok(target.x+target.width<detail.x);
      }
      await page.screenshot({path:path.join(output,`viewport-${viewport.width}.png`)});
      // Verify the canvas is nonblank and changes with camera movement.
      const before=await page.locator('#viewport canvas').screenshot();
      await page.locator('[data-assembly-view=top]').click();
      await page.waitForTimeout(150);
      const after=await page.locator('#viewport canvas').screenshot();
      assert.ok(before.length>20000);
      const pixels=await sharp(before).removeAlpha().resize(80,80).raw().toBuffer();
      const colors=new Set();
      let lit=0;
      for(let i=0;i<pixels.length;i+=3) {
        colors.add(`${pixels[i]>>4},${pixels[i+1]>>4},${pixels[i+2]>>4}`);
        if(pixels[i]+pixels[i+1]+pixels[i+2]>90) lit++;
      }
      assert.ok(colors.size>20,'3D canvas must contain varied scene pixels');
      assert.ok(lit>500,'3D canvas must not be blank or mostly black');
      assert.notDeepEqual(before,after);
      if(bottomSheet) {
        await page.locator('#assembly-back').click();
        assert.equal(await page.locator('.assembly-library').isVisible(),true);
        await page.locator('#assembly-search').fill('BBO');
        await page.locator('[data-part=bbo]').click();
        assert.match(await page.locator('#assembly-role').innerText(),/相位匹配/);
      }
      if(bottomSheet) await page.locator('#assembly-back').click();
      await page.locator('#assembly-search').fill('B 端符合计数设备');
      await page.locator('[data-part="counter-B"]').click();
      if(bottomSheet) {
        const counterTarget=await page.locator('#assembly-target').boundingBox();
        const counterDetail=await page.locator('.assembly-detail').boundingBox();
        assert.ok(counterTarget.y+counterTarget.height<counterDetail.y);
      }
      await page.screenshot({path:path.join(output,`counter-mount-${viewport.width}.png`)});
      await page.locator('#assembly-target').click();
      await page.waitForTimeout(350);
      const visible=(await page.evaluate(()=>LabAssemblyScene.snapshot())).visible;
      assert.ok(visible.includes('counter-B'));
      assert.ok(!visible.includes('counter'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,`counter-installed-${viewport.width}.png`)});
      await page.locator('#assembly-remove').click();
      assert.ok(!(await page.evaluate(()=>LabAssemblyScene.snapshot())).visible.includes('counter-B'));
      await context.close();
    }
    assert.deepEqual(errors,[]);
    // The original pure numerical core still validates its embedded reference dataset.
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    const core=scripts.find(s=>s.includes('Pure numerical core'));
    const reference=JSON.parse(scripts.find(s=>s.includes('documentSha256')&&s.trim().startsWith('{')));
    const scope={module:{exports:{}}}; vm.runInNewContext(core,scope);
    const result=scope.module.exports.validateReference(reference);
    console.log(JSON.stringify({passed:true,parts:partCount,viewports:[1440,1024,844,390,360],rawS:result.S,correctedS:result.Sc,screenshots:output},null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
