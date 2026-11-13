(function () {
  'use strict';
  const scene = window.LabAssemblyScene;
  if(!scene) return;
  const $ = selector => document.querySelector(selector);
  const icon = name => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AssemblyIcons[name].map(([tag,attrs]) => `<${tag} ${Object.entries(attrs).map(([key,value]) => `${key}="${value}"`).join(' ')}></${tag}>`).join('')}</svg>`;
  const items = scene.catalog().map(part => {
    const [category,name,role,location,note] = AssemblyCatalog[part.id];
    return {...part,category,name,role,location,note};
  });
  const categories = [...new Set(items.map(part => part.category))];
  const storageKey = 'chsh-assembly-v1';
  let installed = new Set(), current = null, category = categories[0], active = false, filter = '', storageFailed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if(saved?.version === 1 && Array.isArray(saved.installed)) installed = new Set(saved.installed.filter(id => items.some(p => p.id === id)));
  } catch (_) { /* A corrupt or unavailable store must not prevent a new practice session. */ }
  const previews = scene.thumbnails();
  const modeSwitch = document.createElement('div');
  modeSwitch.className = 'lab-mode-switch';
  modeSwitch.setAttribute('role','group');
  modeSwitch.setAttribute('aria-label','实验工作区');
  modeSwitch.innerHTML = '<button id="assembly-mode" aria-pressed="false">引导装配</button><button id="experiment-mode" aria-pressed="true">完整实验</button>';
  $('.topbar').insertBefore(modeSwitch,$('.header-actions'));
  const host = document.createElement('section');
  host.id = 'assembly-workspace';
  host.hidden = true;
  host.setAttribute('aria-label','光学器件装配');
  host.innerHTML = `
    <aside class="assembly-library" aria-label="器件库">
      <header class="assembly-heading"><div><span class="assembly-eyebrow">OPTICAL COMPONENTS</span><h2>器件库</h2></div><button id="assembly-reset" class="assembly-icon" title="重新装配" aria-label="重新装配">${icon('RotateCcw')}</button></header>
      <div class="assembly-progress-line"><span>装配进度</span><strong id="assembly-progress-text"></strong></div>
      <progress id="assembly-progress" max="${items.length}" value="0" aria-label="装配进度"></progress>
      <div id="assembly-categories" role="group" aria-label="器件分类">${categories.map((name,index) => `<button data-category="${index}" aria-pressed="${index===0}">${name}</button>`).join('')}</div>
      <label class="assembly-search"><span class="sr-only">搜索器件</span><input id="assembly-search" type="search" placeholder="搜索器件" autocomplete="off"></label>
      <div id="assembly-list" aria-label="可选器件"></div>
      <footer class="assembly-library-foot"><span id="assembly-save-status">进度保存在此浏览器</span><button id="assembly-next" title="选择下一件待安装器件">下一件 ${icon('ChevronRight')}</button></footer>
    </aside>
    <aside class="assembly-detail" aria-label="器件作用与安装位置">
      <header class="assembly-detail-head"><button id="assembly-back" class="assembly-icon" title="返回器件库" aria-label="返回器件库">${icon('ArrowLeft')}</button><span id="assembly-detail-category"></span><span id="assembly-item-state"></span></header>
      <div class="assembly-detail-scroll"><div class="assembly-preview"><img id="assembly-preview" alt=""><span id="assembly-part-number"></span></div>
      <h2 id="assembly-part-name"></h2>
      <section class="assembly-role"><h3>器件作用</h3><p id="assembly-role"></p></section>
      <section class="assembly-location"><h3>安装位置</h3><p id="assembly-location"></p><button id="assembly-locate">${icon('LocateFixed')} 定位安装位</button></section>
      <details class="assembly-model-note"><summary>模型说明</summary><p id="assembly-model-note"></p></details></div>
      <footer class="assembly-detail-foot"><p id="assembly-feedback" role="status" aria-live="polite"></p><div class="assembly-item-actions"><button id="assembly-remove">${icon('Undo2')} 拆下</button><button id="assembly-detail-next">下一件 ${icon('ChevronRight')}</button></div><button id="assembly-continue" class="assembly-primary" disabled>${icon('Check')} 完成装配，进入实验</button></footer>
    </aside>
    <div class="assembly-scene-heading"><span class="assembly-eyebrow">CHSH / OPTICAL BENCH</span><h2 id="assembly-task-title">光路装配</h2><span id="assembly-task-subtitle"></span></div>
    <button id="assembly-target" title="安装选中器件"><span class="assembly-target-ring">${icon('LocateFixed')}</span><span class="assembly-target-caption"></span></button>
    <div class="assembly-view-tools" role="group" aria-label="装配视角"><button data-assembly-view="overview">全景</button><button data-assembly-view="top">俯视</button><button id="assembly-refocus" title="定位选中器件" aria-label="定位选中器件">${icon('LocateFixed')}</button></div>
    <dialog id="assembly-reset-dialog"><form method="dialog"><h2>重新装配？</h2><p>本次装配进度将清空，器件全部回到库中。实验参数和已生成的数据不变。</p><div><button value="cancel">取消</button><button value="reset" class="assembly-primary">重新装配</button></div></form></dialog>`;
  document.body.appendChild(host);
  function save() {
    try { localStorage.setItem(storageKey,JSON.stringify({version:1,installed:[...installed]})); }
    catch (_) { storageFailed=true; }
    $('#assembly-save-status').textContent = storageFailed ? '本次进度仅在当前页面保留' : '进度保存在此浏览器';
  }
  function renderList() {
    const shown = items.filter(p => (filter || p.category===category) && (!filter || (p.name+p.role).toLowerCase().includes(filter)));
    $('#assembly-list').innerHTML = shown.length ? shown.map(part => `<button class="assembly-item" data-part="${part.id}" aria-pressed="${part.id===current}" aria-label="${part.name}，${installed.has(part.id)?'已安装':'待安装'}"><img src="${previews[part.id]}" alt=""><span><strong>${part.name}</strong><small>${installed.has(part.id)?'已安装':'待安装'} <span class="assembly-item-number">${String(part.index).padStart(2,'0')}</span></small></span><span class="assembly-item-check">${installed.has(part.id)?icon('Check'):icon('ChevronRight')}</span></button>`).join('') : '<p class="assembly-no-results">没有匹配的器件</p>';
    $('#assembly-categories').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(categories[button.dataset.category]===category&&!filter)));
  }
  function renderProgress() {
    const complete = installed.size===items.length;
    $('#assembly-progress-text').textContent = `${installed.size} / ${items.length}`;
    $('#assembly-progress').value = installed.size;
    $('#assembly-continue').disabled = !complete;
    $('#assembly-next').disabled = complete;
    $('#assembly-detail-next').disabled = complete;
    $('#assembly-task-title').textContent = complete ? '光路装配完成' : '光路装配';
    $('#assembly-task-subtitle').textContent = complete ? '全部器件已就位' : `${items.length-installed.size} 件待安装`;
  }
  function feedback(message) { $('#assembly-feedback').textContent=message; }
  function select(id,move=true) {
    const part = items.find(p => p.id===id);
    if(!part) return;
    current=id;
    const done = installed.has(id);
    scene.select(id,move);
    $('#assembly-detail-category').textContent=part.category;
    $('#assembly-item-state').textContent=done?'已安装':'待安装';
    $('#assembly-item-state').classList.toggle('is-installed',done);
    $('#assembly-preview').src=previews[id];
    $('#assembly-preview').alt=part.name+'三维模型';
    $('#assembly-part-number').textContent=String(part.index).padStart(2,'0');
    $('#assembly-part-name').textContent=part.name;
    $('#assembly-role').textContent=part.role;
    $('#assembly-location').textContent=part.location;
    $('#assembly-model-note').textContent=part.note;
    $('#assembly-remove').hidden=!done;
    $('#assembly-target .assembly-target-caption').textContent=`安装 ${String(part.index).padStart(2,'0')}`;
    $('#assembly-target').setAttribute('aria-label','安装'+part.name);
    host.classList.add('show-detail');
    feedback(done ? '器件已就位。' : `待安装：${part.name}`);
    renderList();
    renderProgress();
    document.dispatchEvent(new CustomEvent('assembly-selected',{detail:{id}}));
  }
  function install(id) {
    if(!active || !current || installed.has(id)) return;
    if(id!==current) { feedback('位置不匹配。当前器件的安装位已高亮。'); return; }
    if(!scene.install(id)) return;
    installed.add(id); save(); select(id,false);
    feedback(installed.size===items.length ? '全部器件已安装，可以进入实验。' : '安装完成。可继续选择下一件器件。');
  }
  function enter() {
    const running = ['running','paused'].includes(window.QLab?.getSnapshot().status);
    if(running) { document.dispatchEvent(new CustomEvent('lab-notice',{detail:'请先完成当前采集，再进入装配。'})); return; }
    active=true;
    document.body.classList.remove('clean');
    document.body.classList.add('assembly-active');
    host.hidden=false;
    $('#assembly-mode').setAttribute('aria-pressed','true');
    $('#experiment-mode').setAttribute('aria-pressed','false');
    scene.enter(installed);
    select(current||items.find(p=>!installed.has(p.id))?.id||items[0].id);
    host.classList.remove('show-detail');
  }
  function leave() {
    active=false;
    host.hidden=true;
    document.body.classList.remove('assembly-active');
    $('#assembly-mode').setAttribute('aria-pressed','false');
    $('#experiment-mode').setAttribute('aria-pressed','true');
    scene.leave();
    document.dispatchEvent(new Event('assembly-ended'));
  }
  function next() {
    const remaining=items.find(p=>!installed.has(p.id)&&p.id!==current)||items.find(p=>!installed.has(p.id));
    if(!remaining) return;
    category=remaining.category; filter=''; $('#assembly-search').value='';
    select(remaining.id);
    $(`[data-part="${remaining.id}"]`)?.scrollIntoView({block:'nearest'});
  }
  $('#assembly-mode').addEventListener('click',enter);
  $('#experiment-mode').addEventListener('click',leave);
  $('#assembly-continue').addEventListener('click',()=>{ if(installed.size===items.length) leave(); });
  $('#assembly-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-part]');
    if(button) select(button.dataset.part);
  });
  $('#assembly-categories').addEventListener('click',event=>{
    const button=event.target.closest('[data-category]');
    if(!button) return;
    category=categories[button.dataset.category]; filter=''; $('#assembly-search').value=''; renderList();
  });
  $('#assembly-search').addEventListener('input',event=>{ filter=event.target.value.trim().toLowerCase(); renderList(); });
  $('#assembly-next').addEventListener('click',next);
  $('#assembly-detail-next').addEventListener('click',next);
  $('#assembly-target').addEventListener('click',()=>install(current));
  document.addEventListener('assembly-slot',event=>install(event.detail));
  document.addEventListener('optic-selected',event=>{ if(active) select(event.detail.id,false); });
  $('#assembly-locate').addEventListener('click',()=>scene.focus(current));
  $('#assembly-refocus').addEventListener('click',()=>scene.focus(current));
  $('#assembly-back').addEventListener('click',()=>{host.classList.remove('show-detail');$('#assembly-search').focus({preventScroll:true});});
  $('#assembly-remove').addEventListener('click',()=>{
    if(!installed.has(current)) return;
    installed.delete(current); scene.remove(current); save(); select(current,false); feedback('器件已回到库中，可以重新安装。');
  });
  $('#assembly-reset').addEventListener('click',()=>{
    window.Lab3D.clearKeys(); $('#assembly-reset-dialog').showModal();
  });
  $('#assembly-reset-dialog').addEventListener('close',event=>{
    if(event.target.returnValue!=='reset') return;
    installed.clear(); current=null; category=categories[0]; filter=''; $('#assembly-search').value='';
    save(); enter(); feedback('装配已重置。');
  });
  host.querySelectorAll('[data-assembly-view]').forEach(button=>button.addEventListener('click',()=>window.Lab3D.preset(button.dataset.assemblyView)));
  // Keep keyboard focus traversal available instead of the scene's legacy Tab shortcut.
  window.addEventListener('keydown',event=>{
    if(active && event.code==='Tab') event.stopImmediatePropagation();
  },true);
  $('#run').addEventListener('click',event=>{
    if(active) { event.stopImmediatePropagation(); event.preventDefault(); }
  },true);
  window.addEventListener('resize',()=>{if(active&&current) scene.focus(current);});
  let previousFrame=0;
  function marker(ms) {
    requestAnimationFrame(marker);
    if(ms-previousFrame<40) return;
    previousFrame=ms;
    const button=$('#assembly-target');
    if(!active||!current||installed.has(current)||$('#assembly-reset-dialog').open) { button.hidden=true; return; }
    const p=scene.position(current);
    const narrow=innerWidth<900 && !(innerWidth>=600 && innerHeight<=560);
    const sheet=(host.classList.contains('show-detail')?$('.assembly-detail'):$('.assembly-library')).getBoundingClientRect();
    const blocked=narrow ? p.y+55>sheet.top : p.x<$('.assembly-library').getBoundingClientRect().right+35||p.x>$('.assembly-detail').getBoundingClientRect().left-35;
    button.hidden=p.depth < -1||p.depth>1||p.x<30||p.x>innerWidth-30||p.y<120||p.y>innerHeight-90||blocked;
    if(!button.hidden) { button.style.left=p.x+'px'; button.style.top=p.y+'px'; }
  }
  window.LabAssembly={getSnapshot:()=>({active,current,installed:[...installed],total:items.length})};
  enter();
  requestAnimationFrame(marker);
})();
