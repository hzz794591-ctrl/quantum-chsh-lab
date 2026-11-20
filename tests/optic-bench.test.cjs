const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const out=process.env.QA_OUTPUT||path.join(root,'test-output','optics');

async function main(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    const click=s=>page.locator(s).click(), full='#experiment-pump [role=switch]';
    const snapshot=()=>page.evaluate(()=>QLab.getSnapshot());
    const select=id=>page.evaluate(id=>Lab3D.select(id),id);
    async function checkClip(key){
      await page.waitForFunction(key=>{const v=document.querySelector('.optic-clip video');return v?.currentSrc.endsWith(`/${key}.mp4`)&&v.readyState>=1;},key);
      const v=page.locator('.optic-clip video');assert.ok(await v.isVisible());
      assert.equal(await v.evaluate(v=>v.duration),6);
      await v.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.optic-clip video').currentTime>.1);
      assert.deepEqual(await v.evaluate(v=>[v.videoWidth,v.videoHeight,v.error]),[2560,1440,null]);
    }
    await click('[data-part=pbs]');await checkClip('pbs');
    await page.locator('.optic-clip summary').click();await page.waitForFunction(()=>document.querySelector('video').paused);
    await click('[data-stop=bbo]');await checkClip('bbo');
    await click('[data-stop=A-hwp]');await checkClip('hwp');
    const frameTime=await page.locator('video').evaluate(v=>{v.pause();v.currentTime=4.7;return v.currentTime;});
    await click('.clip-tools button');
    await page.waitForFunction(()=>document.querySelector('#clip-theater video')?.readyState>=2&&!document.querySelector('video').seeking);
    const theater=page.locator('#clip-theater'), film=theater.locator('video');
    assert.equal(await film.evaluate(v=>v.paused&&Math.abs(v.currentTime-4.7)<.02),true);
    assert.ok((await film.boundingBox()).width>1100);
    await page.screenshot({path:path.join(out,'hwp-enlarged.png')});
    await page.keyboard.press('Escape');assert.ok(await theater.isHidden());
    assert.equal(await page.locator('.optic-clip video').evaluate((v,t)=>v.paused&&Math.abs(v.currentTime-t)<.02,frameTime),true);
    await click('[data-part=A-polarizer]');await checkClip('analyzer');
    assert.match(await page.locator('#assembly-part-name').innerText(),/偏振分析器/);
    await page.screenshot({path:path.join(out,'desktop-analyzer.png')});
    await click('[data-category="0"]');await click('[data-part=laser-controller]');
    assert.equal(await page.locator('video').evaluate(v=>v.paused&&!v.hasAttribute('src')),true);
    assert.equal(await page.locator('#assembly-power').inputValue(),'40');
    await page.locator('#assembly-power').fill('20');await click('#assembly-pump [role=switch]');
    await click('#experiment-mode');assert.equal(await page.locator(full).getAttribute('aria-checked'),'true');
    assert.equal(await page.evaluate(()=>Lab3D.snapshot().beams),true);
    await select('laser-controller');assert.equal(await page.locator('#experiment-power').inputValue(),'20');
    await page.locator('#experiment-power').fill('0');assert.equal(await page.evaluate(()=>QLab.startGroup()),false);
    assert.ok(await page.locator('#run').isDisabled());await page.locator('#experiment-power').fill('20');
    await click(full);assert.equal(await page.evaluate(()=>QLab.startGroup()),false);
    assert.ok(await page.locator('#beam-toggle').isDisabled());await click(full);
    await page.locator('#speed').selectOption('20');await click('#run');await click(full);
    assert.equal((await snapshot()).status,'paused');assert.ok(await page.locator('#pause').isDisabled());
    assert.equal(await page.evaluate(()=>QLab.setPumpPower(40)),false);
    await click(full);assert.equal((await snapshot()).status,'paused');
    await page.locator('#speed').selectOption('480');await click('#pause');
    for(let n=1;n<=4;n++){
      if(n!==1){await click('#next-group');await click('#run');}
      await page.waitForFunction(n=>QLab.getSnapshot().session.completed===n,n);
      if(n<4)assert.equal((await snapshot()).data,null);
    }
    const data=(await snapshot()).data;assert.equal(data.metadata.config.pumpPower,20);
    assert.equal(data.metadata.kind,'synthetic-simulation');assert.ok(data.rows.every(r=>r.origin==='simulated'));
    const [rows40,rows20]=await page.evaluate(()=>{const r=JSON.parse(document.querySelector('#reference-data').textContent);return [40,20].map(pumpPower=>CHSH.expectedRows(r,{pumpPower}));});
    for(const [i,r] of rows20.entries()){
      assert.equal(r.accidental,rows40[i].accidental);
      assert.ok(Math.abs(r.net-rows40[i].net/2)<1e-8);
      assert.equal(data.rows[i].mean,r.mean);
    }
    const download=page.waitForEvent('download');await click('#csv-export');
    const csv=fs.readFileSync(await (await download).path(),'utf8').trim().split('\r\n');
    assert.match(csv[0],/"pump_power_relative"$/);assert.ok(csv.slice(1).every(row=>row.endsWith(',"20"')));
    await click('#results-dialog [data-close]');await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'no-preference'});await select('B-polarizer');
    await page.waitForFunction(()=>document.querySelector('video').currentTime>0);
    const bounds=await page.locator('video').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
    await page.screenshot({path:path.join(out,'mobile-analyzer.png')});
    await page.setViewportSize({width:844,height:390});await click('.clip-tools button');
    await page.waitForFunction(()=>document.querySelector('#clip-theater video').currentTime>.25&&!document.querySelector('video').paused);
    const wide=await film.boundingBox();assert.ok(wide.y>=0&&wide.y+wide.height<=390&&wide.width<=844);
    assert.ok(Math.abs(wide.width/wide.height-16/9)<.02);
    await click('#clip-theater .clip-play');await theater.locator('input').fill('3');
    await page.waitForFunction(()=>document.querySelector('video').paused&&Math.abs(document.querySelector('video').currentTime-3)<.02&&!document.querySelector('video').seeking);
    assert.equal(await film.evaluate(v=>v.controls),false);
    assert.ok((await page.locator('.clip-transport').boundingBox()).y>=wide.y+wide.height-1);
    await page.screenshot({path:path.join(out,'mobile-landscape-clip.png')});await click('#clip-theater header button');
    await select('pump-qwp');assert.ok(await page.locator('.optic-clip').isHidden());
    assert.deepEqual(errors,[]);
    console.log('Passed: four local clips decoded, motion preference, desktop/mobile, controller sync, zero/off interlock, pause/resume, signal-only power scaling, simulated rows and exported power.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
