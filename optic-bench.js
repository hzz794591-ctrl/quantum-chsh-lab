/* Shared controls for the physical source and the selected optic's teaching clip. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s), api=window.QLab;
  const clipData={
    pbs:['PBS 偏振分束器','p 偏振直行，s 偏振转向。图中两路表示一束光的两个偏振分量，不是复制一个光子。'],
    bbo:['BBO 晶体','大多数泵浦光子直接通过；满足条件时，少数会转化成一对光子。产生光子对不等于已经制备出偏振纠缠。'],
    hwp:['半波片','以水平线偏振入射为例：快轴从 0° 转到 22.5°，出射偏振方向转到 45°。演示角不会改动实验角度。'],
    analyzer:['偏振分析器','金色是固定透射轴，青色是入射线偏振。两者夹角从 0° 变到 45°、90°，理想透过率由 100% 变为 50%、0%。']
  };
  const clipKey=id=>id==='pbs'||id==='bbo'?id:/^(pump-hwp(-input)?|[AB]-hwp)$/.test(id)?'hwp':/^[AB]-polarizer$/.test(id)?'analyzer':null;
  const icon=name=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AssemblyIcons[name].map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('')}</svg>`;
  function makePump(scope){
    const root=document.createElement('section');root.id=scope+'-pump';root.className='pump-console';root.setAttribute('aria-label','激光器控制盒');
    root.innerHTML=`<div class="pump-line"><button class="pump-switch" role="switch" aria-checked="false" aria-label="激光器电源"><i aria-hidden="true"></i><span></span></button><button class="pump-disclosure" aria-controls="${scope}-power-panel" aria-expanded="false" title="调节相对功率">功率 <output></output>${icon('ChevronRight')}</button></div><div class="pump-level" id="${scope}-power-panel" hidden><label for="${scope}-power">相对功率 <span>0 至 40</span></label><input id="${scope}-power" type="range" min="0" max="40" step="1"><small>40 为参考档，非毫瓦数；每轮四组共用同一功率。</small></div>`;
    const sw=root.querySelector('.pump-switch'), expand=root.querySelector('.pump-disclosure'), level=root.querySelector('.pump-level'), slider=root.querySelector('input');
    sw.addEventListener('click',api.toggleLaser);
    const open=yes=>{expand.setAttribute('aria-expanded',String(yes));level.hidden=!yes;};
    expand.addEventListener('click',()=>open(level.hidden));slider.addEventListener('input',()=>api.setPumpPower(slider.valueAsNumber));
    function sync(){const p=api.getLaser();sw.setAttribute('aria-checked',String(p.on));sw.querySelector('span').textContent=p.on?'激光已开':'激光未开';slider.value=p.power;slider.disabled=p.locked;root.querySelector('output').textContent=p.power;}
    sync();document.addEventListener('measurement-change',sync);return {root,open};
  }
  const prep=makePump('assembly'), full=makePump('experiment');
  $('.assembly-role').before(prep.root);prep.open(true);
  $('#measurement-workflow header').after(full.root);

  const player=document.createElement('details');player.className='optic-clip';player.hidden=true;
  player.innerHTML=`<summary>${icon('ChevronRight')}<strong></strong><span>6 秒</span></summary><video controls muted playsinline preload="metadata"></video><div class="clip-tools"><small>1440p</small><button type="button" aria-haspopup="dialog" aria-controls="clip-theater" title="放大观看原理演示">${icon('Maximize2')}放大观看</button></div><p></p>`;
  const video=player.querySelector('video'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const tools=player.querySelector('.clip-tools'), enlarge=tools.querySelector('button');
  const theater=document.createElement('dialog');theater.id='clip-theater';theater.setAttribute('aria-labelledby','clip-theater-name');
  theater.innerHTML=`<header><strong id="clip-theater-name"></strong><button type="button" title="返回实验" aria-label="关闭放大观看" autofocus>${icon('X')}</button></header><div class="clip-screen"></div><div class="clip-transport"><button type="button" class="clip-play"></button><input type="range" min="0" max="6" step="0.01" value="0" aria-label="视频进度（秒）"><output>0:00 / 0:06</output></div>`;
  document.body.append(theater);
  const play=theater.querySelector('.clip-play'),seek=theater.querySelector('input'),clock=theater.querySelector('output');
  function syncTransport(){
    if(!theater.open)return;
    const label=video.ended?'重播':video.paused?'播放':'暂停';
    if(play.title!==label){play.title=label;play.setAttribute('aria-label',label);play.innerHTML=icon(video.ended?'RotateCcw':video.paused?'Play':'Pause');}
    const duration=Number.isFinite(video.duration)?video.duration:6;seek.max=duration;seek.value=video.currentTime;
    const time=s=>'0:'+String(Math.floor(s)).padStart(2,'0');clock.textContent=`${time(video.currentTime)} / ${time(duration)}`;
  }
  play.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{});else video.pause();});
  seek.addEventListener('input',()=>{if(video.readyState)video.currentTime=seek.valueAsNumber;});
  for(const name of ['play','pause','ended','timeupdate','seeking','loadedmetadata'])video.addEventListener(name,syncTransport);
  function moveVideo(move){
    const playing=!video.paused&&!video.ended;
    move();if(playing)video.play().catch(()=>{});
  }
  enlarge.addEventListener('click',()=>{
    if(!active||theater.open)return;
    window.Lab3D.clearKeys();theater.querySelector('strong').textContent=video.getAttribute('aria-label');
    theater.showModal();video.controls=false;moveVideo(()=>theater.querySelector('.clip-screen').append(video));syncTransport();
  });
  function shrink(){
    if(theater.contains(video)){moveVideo(()=>tools.before(video));video.controls=true;}
    if(theater.open)theater.close();
  }
  theater.querySelector('button').addEventListener('click',shrink);
  theater.addEventListener('cancel',e=>{e.preventDefault();shrink();});
  theater.addEventListener('click',e=>{if(e.target===theater)shrink();});
  theater.addEventListener('close',()=>{if(!theater.open&&theater.contains(video))shrink();});
  let active=null;
  function autoplay(){if(!reduced.matches&&player.open&&!player.hidden)video.play().catch(()=>{});}
  player.addEventListener('toggle',()=>{if(!player.open)video.pause();else autoplay();});
  function stop(){
    if(theater.open){video.pause();shrink();}
    if(active){video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();}
    active=null;player.hidden=true;player.open=false;$('.assembly-detail-scroll').classList.remove('clip-selected');
  }
  function select(id,assembling){
    const key=clipKey(id), controller=id==='laser-controller';
    prep.root.hidden=!controller;
    if(!assembling&&(controller||key)&&$('#panel-body').hidden)$('#panel-collapse').click();
    if(!key){stop();if(controller&&!assembling){full.open(true);full.root.scrollIntoView({block:'nearest'});}return;}
    const identity=`${assembling}:${id}`;if(identity===active)return;
    stop();active=identity;
    if(assembling){$('.assembly-detail-scroll').classList.add('clip-selected');$('.assembly-role').before(player);}
    else $('#panel-body').prepend(player);
    const [title,description]=clipData[key];player.querySelector('strong').textContent=title+' · 功能演示';
    player.querySelector('p').textContent=description;video.setAttribute('aria-label',title+'功能演示');
    video.poster=`media/optics/${key}.png`;video.src=`media/optics/${key}.mp4`;
    player.hidden=false;player.open=true;autoplay();
    if(!assembling){$('#panel-body').scrollTop=0;$('.instrument-panel').scrollTop=0;}
  }
  document.addEventListener('assembly-selected',e=>select(e.detail.id,true));
  document.addEventListener('optic-selected',e=>{if(!window.LabAssembly.getSnapshot().active)select(e.detail.id,false);});
  document.addEventListener('assembly-ended',()=>{stop();full.open(false);});
  $('#assembly-back').addEventListener('click',()=>{if(active)stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
  select(window.LabAssembly.getSnapshot().current,true);
})();
