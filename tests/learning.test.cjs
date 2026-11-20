/* Exercises the teaching UI with the same stored angles and counts as a normal run. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

async function main(){
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    const click=s=>page.locator(s).click(), text=s=>page.locator(s).innerText();
    const assembly=()=>page.evaluate(()=>LabAssemblyScene.snapshot());
    const snap=()=>page.evaluate(()=>QLab.getSnapshot());
    assert.equal((await assembly()).preview,'laser');
    await click('[data-stop=bbo]');
    const p=await page.evaluate(()=>Lab3D.screenPosition('bbo'));
    assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y).tagName,p),'CANVAS');
    await page.mouse.click(p.x,p.y);
    assert.deepEqual((await assembly()).visible,['bbo']);assert.equal((await assembly()).preview,null);
    await click('#assembly-remove');assert.equal((await assembly()).preview,'bbo');
    await click('[data-stop=counter]');assert.equal((await assembly()).preview,'counter');
    await click('[data-stop=A-hwp]');assert.equal((await assembly()).preview,'A-hwp');
    await page.locator('#assembly-A0').fill('12.5');
    assert.equal(await page.locator('#assembly-hwp-settings [data-arm=A] .axis-analysis').getAttribute('transform'),'rotate(-25 19 19)');
    await click('#assembly-target');await click('[data-stop=measure]');
    await click('#experiment-pump [role=switch]');
    assert.equal((await assembly()).active,false);assert.equal((await assembly()).preview,null);
    assert.deepEqual((await assembly()).installed,['A-hwp']);
    assert.equal(await page.locator('#current-A').inputValue(),'12.5');
    await page.locator('#viewport').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('clean')),false);
    await click('[data-read="0"]');
    await click('[data-guess=same]');
    await page.locator('#current-A').fill('0');
    assert.equal(await page.locator('[data-guess=same]').getAttribute('aria-pressed'),'false');
    await click('[data-guess=different]');
    await page.locator('#speed').selectOption('20');await click('#run');await click('#pause');
    assert.match(await text('#note-phase'),/暂停于/);
    assert.equal(await page.locator('.outcome-grid [data-phase=active]').count(),1);
    assert.equal(await page.locator('[data-guess=same]').isEnabled(),false);
    await page.locator('#speed').selectOption('480');await click('#pause');
    let first;
    for(let i=0;i<4;i++){
      if(i){
        await click('#next-group');
        if(i===1){
          await click('[data-read="0"]');
          assert.equal(await text('#note-equation'),first);
          assert.equal((await snap()).session.currentGroup,2);
          await click('[data-read="1"]');await page.locator('#current-A').fill('9');
        }
        assert.deepEqual(await page.locator('.outcome-grid strong').allTextContents(),['—','—','—','—']);
        await click('#run'); // No prediction is required for these groups.
      }
      await page.waitForFunction(n=>QLab.getSnapshot().session.completed===n,i+1);
      const session=await snap(), g=session.session.groups[i];
      const counts=await page.locator('.outcome-grid strong').allTextContents();
      assert.deepEqual(counts.map(n=>Number(n.replaceAll(',',''))),g.counts);
      const [pp,pm,mp,mm]=g.counts;
      assert.ok((await text('#note-equation')).includes(`(${pp+mm} − ${pm+mp}) / ${g.total} ≈ ${g.E.toFixed(4)}`));
      if(!i){first=await text('#note-equation');assert.match(await text('#note-feedback'),/预测/);}
      assert.equal(await page.locator('#note-conclusion').evaluate(e=>e.hidden),i<3);
      if(i<3)assert.equal(session.data,null);
    }
    const data=(await snap()).data;
    assert.equal(data.result.chsh.valid,false);
    assert.match(await text('#note-conclusion h3'),/不是 CHSH 配对/);
    for(const g of data.result.groups)assert.ok((await text('.note-result-terms')).includes(g.E.toFixed(4)));
    assert.ok((await text('.note-result-formula')).includes(data.result.S.toFixed(4)));
    await click('#results-dialog [data-close]');await click('#measurement-reset');
    await click('#measurement-reset-dialog [value=reset]');
    assert.equal(await page.locator('#note-conclusion').evaluate(e=>e.hidden),true);
    assert.equal(await page.locator('[data-guess=different]').getAttribute('aria-pressed'),'false');
    for(const size of [{width:360,height:640},{width:390,height:844}]){
      await page.setViewportSize(size);await click('#assembly-mode');await click('#experiment-mode');
      await page.evaluate(()=>document.querySelector('#panel-body').scrollTop=0);
      const btn=await page.locator('#run').boundingBox(), panel=await page.locator('#panel-body').boundingBox();
      assert.ok(btn.y>=panel.y&&btn.y+btn.height<=panel.y+panel.height,'Primary action must be visible without scrolling');
      const counters=await page.evaluate(()=>['counter','counter-B'].map(id=>Lab3D.screenPosition(id)));
      const rail=await page.locator('.view-rail').boundingBox();
      assert.ok(counters.every(p=>p.x>0&&p.x<size.width&&p.y<rail.y&&p.y>65),'Both counters must be in the exposed scene');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    assert.deepEqual(errors,[]);
    console.log('Passed: ghost mounting, free navigation, angle dials, optional predictions, pause, four recorded E substitutions, non-CHSH reading, reset and mobile framing.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
