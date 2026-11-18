/* The notebook observes the acquisition. A prediction never changes angles, RNG or records. */
'use strict';
function createLabNotebook(workflow,assembly,ledger,icon) {
  const $=s=>document.querySelector(s), arms=['A','B'];
  const signs=['++','+−','−+','−−'], digits=['₁','₂','₃','₄'];
  const groupName=i=>'E'+digits[i], format=n=>n.toLocaleString('zh-CN');
  const dials=[];
  function dial(parent,arm,scope){
    const span=document.createElement('span');span.className='axis-dial';span.dataset.arm=arm;
    span.innerHTML=`<svg viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="16"/><path class="axis-grid" d="M3 19h32M19 3v32"/><path class="axis-analysis" d="M5 19h28"/><path class="axis-mechanical" d="M9 19h20"/><circle class="axis-pin" cx="19" cy="19" r="2"/></svg>`;
    parent.append(span);dials.push({span,arm,scope,axis:span.querySelector('.axis-mechanical'),analysis:span.querySelector('.axis-analysis')});
  }
  function key(){return '<span class="axis-key"><i></i>半波片轴 θ <i></i>分析轴 2θ</span>';}
  arms.forEach((arm,i)=>{
    const label=workflow.querySelector(`label[for="current-${arm}"]>span`);label.classList.add('axis-label');dial(label,arm,'bench');
    dial(assembly.querySelectorAll('.assembly-angle-preview')[i],arm,'assembly');
  });
  $('#current-position').insertAdjacentHTML('beforeend',key());
  assembly.querySelector('.hwp-assumption').insertAdjacentHTML('beforebegin',key());

  const strip=document.createElement('div');strip.className='e-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','各组实验手记');
  strip.innerHTML=digits.map((_,i)=>`<button type="button" data-read="${i}" aria-controls="lab-notebook">${groupName(i)}<span></span></button>`).join('');
  $('#measurement-progress').after(strip);
  const note=document.createElement('details');note.id='lab-notebook';
  note.innerHTML=`<summary>${icon('BookOpen')}<strong>实验手记</strong><span id="note-label"></span>${icon('ChevronRight')}</summary>
  <div class="note-body"><div class="note-meta"><strong id="note-group"></strong><span id="note-phase"></span></div>
  <div class="outcome-grid">${signs.map(s=>`<div><span>${s}</span><strong>—</strong></div>`).join('')}</div>
  <div id="note-before"><p>这组角度下，哪类符合计数会更多？</p><div class="note-choices" role="group" aria-label="采集前的预测，可跳过"><button type="button" data-guess="same">同号更多</button><button type="button" data-guess="different">异号更多</button></div></div>
  <div id="note-observed" hidden><p class="note-totals"><span>同号 <b></b></span><span>异号 <b></b></span></p><div class="note-balance" aria-hidden="true"><i></i></div><p id="note-equation"></p></div>
  <p id="note-feedback"></p></div>`;
  workflow.append(note,ledger); // Keep angle controls and acquisition ahead of the expandable records.
  const result=document.createElement('section');result.id='note-conclusion';result.hidden=true;
  result.innerHTML='<h3></h3><p class="note-result-formula"></p><p class="note-result-terms"></p><p class="note-result-reading"></p>';
  $('#results-dialog .result-toolbar').after(result);
  const cells=[...note.querySelectorAll('.outcome-grid>div')], guesses=new Map();
  let model,view=0,phase=-1,dismissed=false;

  function showPhase(){
    const w=model.workflow, g=w.groups[view], collecting=view===w.current&&w.busy;
    cells.forEach((cell,i)=>{cell.dataset.phase=g?'recorded':collecting&&i<phase?'past':collecting&&i===phase?'active':'waiting';});
    $('#note-phase').textContent=g?'原始符合计数':collecting&&phase>=0?`${w.status==='paused'?'暂停于':'正在采集'} ${signs[phase]} · ${phase+1}/4`:'四种输出 · 待采集';
  }
  function showNote(){
    const w=model.workflow, g=w.groups[view], guess=guesses.get(view);
    $('#note-label').textContent=g?`读懂 ${groupName(view)}`:'四次计数 → 一个 E';
    $('#note-group').textContent=`第 ${view+1} 组`;
    cells.forEach((cell,i)=>cell.querySelector('strong').textContent=g?format(g.counts[i]):'—');
    $('#note-before').hidden=!!g;$('#note-observed').hidden=!g;
    note.querySelectorAll('[data-guess]').forEach(b=>{b.setAttribute('aria-pressed',String(guess?.choice===b.dataset.guess));b.disabled=w.busy||!w.valid||!!g;});
    let text;
    if(g){
      const same=g.counts[0]+g.counts[3], different=g.counts[1]+g.counts[2];
      const observed=same===different?'equal':same>different?'same':'different';
      const totals=note.querySelectorAll('.note-totals b');totals[0].textContent=format(same);totals[1].textContent=format(different);
      note.querySelector('.note-balance').hidden=!g.total;
      note.querySelector('.note-balance i').style.width=(g.total?100*same/g.total:0)+'%';
      $('#note-equation').textContent=g.E===null?'没有有效计数，不能计算 E。':`${groupName(view)} = (${same} − ${different}) / ${g.total} ≈ ${g.E.toFixed(4)}`;
      const reading={same:'同号更多，E 为正。',different:'异号更多，E 为负。',equal:'两类计数相同，E 为零。'}[observed];
      text=g.E===null?'分母为零，此组不能用于计算 S。':(guess?(guess.choice===observed?'与预测一致。':'与预测不同。'):'')+reading;
    }else text=guess?`你的预测：${guess.choice==='same'?'同号':'异号'}更多。`:'同号是 ++、−−，异号是 +−、−+。';
    $('#note-feedback').textContent=text;showPhase();
  }
  strip.addEventListener('click',e=>{
    const b=e.target.closest('[data-read]');if(!b||b.disabled)return;
    view=Number(b.dataset.read);showNote();note.open=true;
    const summary=note.querySelector('summary');summary.focus({preventScroll:true});summary.scrollIntoView({block:'nearest'});
  });
  note.addEventListener('click',e=>{
    if(e.target.closest('summary')&&note.open)dismissed=true;
    const b=e.target.closest('[data-guess]');if(!b||b.disabled)return;
    const w=model.workflow;if(view!==w.current||!w.canStart)return;
    guesses.set(view,{...w.position,choice:b.dataset.guess});showNote();
  });
  document.addEventListener('measurement-cleared',()=>{guesses.clear();view=0;phase=-1;dismissed=false;result.hidden=true;});
  document.addEventListener('acquisition-outcome',e=>{
    if(!model || e.detail.group!==model.workflow.current)return;
    phase=e.detail.index;showPhase();
  });
  function render(m){
    const w=m.workflow, previous=model?.workflow;
    if(!previous||previous.current!==w.current||previous.completed!==w.completed){view=w.current;phase=-1;}
    if(previous?.completed===0&&w.completed===1&&!dismissed)note.open=true;
    model=m;
    const guess=guesses.get(w.current);
    if(!w.done&&guess&&(guess.A!==w.position.A||guess.B!==w.position.B))guesses.delete(w.current);
    for(const {span,arm,scope,axis,analysis} of dials){
      const theta=scope==='bench'?w.position[arm]:m.groups[m.active[arm]][arm];
      axis.setAttribute('transform',`rotate(${-theta} 19 19)`);analysis.setAttribute('transform',`rotate(${-2*theta} 19 19)`);
      span.title=`${arm} 端基准方向：机械角 ${theta}°，分析角 ${Number((2*theta).toFixed(4))}°`;
    }
    [...strip.children].forEach((b,i)=>{
      const state=w.groups[i]?'已记录':i===w.current?'当前组':'待测';
      b.disabled=i>w.current;b.dataset.state=w.groups[i]?'done':i===w.current?'current':'pending';
      b.querySelector('span').textContent=w.groups[i]?'✓':i===w.current?'●':'·';
      if(i===w.current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
      b.title=i>w.current?'尚未开始本组':`查看第 ${i+1} 组实验手记`;
      b.setAttribute('aria-label',`第 ${i+1} 组，${state}。${b.title}`);
    });
    showNote();
    if(w.completed===4 && result.hidden){
      const r=window.QLab.getSnapshot().data.result, valid=r.chsh.valid, label=valid?'|S|':'|S*|';
      result.querySelector('h3').textContent=valid?'四个 E 如何合成 CHSH 结果？':'这四组角度不是 CHSH 配对';
      result.querySelector('.note-result-formula').textContent=r.S===null?'存在无有效计数的组，无法给出原始组合值。':`${label} = |E₁ − E₂ + E₃ + E₄| ≈ ${r.S.toFixed(4)}（原始计数）`;
      const values=r.groups.map(g=>g.E===null?'无计数':g.E.toFixed(4));
      result.querySelector('.note-result-terms').textContent=`本轮代入：|(${values[0]}) − (${values[1]}) + (${values[2]}) + (${values[3]})|（各项显示到四位小数）`;
      result.querySelector('.note-result-reading').textContent=!valid?'CHSH 要求两端各选两个方向，并测完四种交叉组合。本轮只能报告四个 E 的组合值，不适用经典界限。':r.S===null?'原始关联函数需要每组至少有一次符合计数。':r.S>2?'本轮原始估计值超过经典界限 2。判断超出是否显著，还要结合计数不确定度。':'本轮原始估计值没有超过经典界限 2；这不等于证明光子没有纠缠。';
      result.hidden=false;
    }
  }
  return {render};
}
