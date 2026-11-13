(function () {
  'use strict';
  const $=s=>document.querySelector(s),api=window.QLab;
  const fmt=n=>Number(n.toFixed(4)).toString();
  const icon=name=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AssemblyIcons[name].map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}></${tag}>`).join('')}</svg>`;
  function controls(scope) {
    return `<table class="group-angle-editor"><thead><tr><th>实验</th><th>A 端机械角</th><th>B 端机械角</th></tr></thead><tbody>${[0,1,2,3].map(i=>`<tr><th scope="row">第 ${i+1} 组</th>${['A','B'].map(arm=>`<td><span class="hwp-input"><input id="${scope}-${arm}${i}" data-hwp-arm="${arm}" data-setting="${i}" type="number" min="-90" max="90" step="any" inputmode="decimal" aria-label="第 ${i+1} 组 ${arm} 端半波片机械角"><span>°</span></span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const workflow=document.createElement('section');
  workflow.id='measurement-workflow';
  workflow.innerHTML=`<header><h3>逐组测量</h3><button id="measurement-reset" type="button" title="重新测量，保留装配角度配置" aria-label="重新测量">${icon('RotateCcw')}</button></header><p id="measurement-progress" role="status" aria-live="polite"></p><p id="chsh-status" class="measurement-warning" role="status" hidden></p><table class="measurement-ledger"><caption>四组角度与关联函数</caption><thead><tr><th>组</th><th>机械角 θA / θB</th><th>实测 E</th></tr></thead><tbody id="measurement-ledger"></tbody></table><div id="current-position"><div class="measurement-group-head"><h4 id="measurement-group-title"></h4><span id="position-status"></span></div><div class="position-pair">${['A','B'].map(arm=>`<label for="current-${arm}"><span>${arm} 端机械角</span><span class="hwp-input"><input id="current-${arm}" data-position-arm="${arm}" type="number" min="-90" max="90" step="any" inputmode="decimal"><span>°</span></span><small id="analysis-${arm}"></small><input type="range" data-position-arm="${arm}" min="-90" max="90" step="0.01" aria-label="调节 ${arm} 端当前机械角"></label>`).join('')}</div></div><div class="measurement-actions"><button id="next-group" type="button" hidden><span>下一组</span>${icon('ChevronRight')}</button></div><div id="measurement-acquisition"></div>`;
  $('#panel-body').prepend(workflow);
  $('#measurement-acquisition').append($('.acquisition'),$('.run-row'));
  const ledger=document.createElement('details');ledger.id='measurement-records';
  ledger.open=!matchMedia('(max-width:760px), (max-height:560px)').matches;
  ledger.innerHTML=`<summary><span>${icon('ChevronRight')}四组 E 记录</span><output id="latest-e"></output></summary>`;
  $('.measurement-ledger').before(ledger);ledger.append($('.measurement-ledger'));
  const full=document.createElement('section');
  full.id='measurement-settings';full.className='measurement-settings';
  full.innerHTML=`<details id="hwp-presets"><summary>四组装配角度配置</summary><header><h3>四次实验 · 机械角</h3><button type="button" data-max-preset title="恢复最大违背示例角度" aria-label="恢复示例角度">${icon('RotateCcw')}</button></header>${controls('experiment')}</details><details class="hwp-theory"><summary>理论预测 · 非实测结果</summary><div class="hwp-prediction"><span id="hwp-model-label">当前 V · 无背景理论 |S|</span><strong id="hwp-model-s"></strong><span>相同角度 · V = 1</span><output id="hwp-ideal-s"></output></div><p id="theory-chsh-status" class="measurement-warning" hidden></p><table><thead><tr><th>组</th><th>θA / θB</th><th>E 理论</th></tr></thead><tbody id="hwp-e-values"></tbody></table><p>|S| = |E₁ − E₂ + E₃ + E₄|</p><p>分析角 a = 2θA、b = 2θB；偏振片固定为 0°，波片零点已标定。每组 E 含四次独立计数，理论值不含背景与抽样噪声。</p></details><p id="hwp-lock-status" role="status"></p>`;
  $('#parameters-details').before(full);
  const assembly=document.createElement('section');
  assembly.id='assembly-hwp-settings';assembly.className='measurement-settings';assembly.hidden=true;
  assembly.innerHTML=`<header><h3>四次实验 · 半波片角度</h3><button type="button" data-max-preset title="恢复最大违背示例角度" aria-label="恢复示例角度">${icon('RotateCcw')}</button></header>${controls('assembly')}<label class="assembly-preview-label" for="assembly-preview-group">装配预览<select id="assembly-preview-group">${[0,1,2,3].map(i=>`<option value="${i}">第 ${i+1} 组</option>`).join('')}</select></label>${['A','B'].map(arm=>`<label class="assembly-angle-preview">${arm} 端 <output id="assembly-preview-${arm}"></output><input class="hwp-slider" type="range" min="-90" max="90" step="0.01" data-slider-arm="${arm}" aria-label="${arm} 端当前组半波片机械角"></label>`).join('')}<p class="hwp-assumption">固定偏振片 0° · 分析角 = 2 × 机械角</p><p id="assembly-hwp-lock"></p>`;
  $('.assembly-model-note').before(assembly);
  const reset=document.createElement('dialog');reset.id='measurement-reset-dialog';
  reset.innerHTML='<form method="dialog"><h2>重新测量？</h2><p>清除本轮计数、E 和 S，保留四组装配角度与装配进度。</p><div><button value="cancel" autofocus>取消</button><button value="reset" class="primary">重新测量</button></div></form>';
  document.body.append(reset);
  function selectPreview(index){for(const arm of ['A','B'])api.selectSetting(arm,index);}
  function setInput(input) {
    if(!input.validity.valid||input.value==='')return false;
    const groups=api.getMeasurement().groups,arm=input.dataset.hwpArm,index=+input.dataset.setting;
    if(groups[index][arm]===input.valueAsNumber)return true;
    groups[index][arm]=input.valueAsNumber;
    const updated=api.setMeasurement(groups);
    if(updated&&assembly.contains(input))selectPreview(index);
    return updated;
  }
  for(const host of [full,assembly]) {
    host.addEventListener('input',e=>{
      const input=e.target;
      if(input.matches('[data-hwp-arm]'))setInput(input);
      if(input.matches('[data-slider-arm]')){
        const m=api.getMeasurement(),arm=input.dataset.sliderArm,index=m.active[arm];
        m.groups[index][arm]=input.valueAsNumber;
        if(api.setMeasurement(m.groups))selectPreview(index);
      }
    });
    host.addEventListener('focusout',e=>{
      if(e.target.matches('[data-hwp-arm]')&&!setInput(e.target)){
        document.dispatchEvent(new CustomEvent('lab-notice',{detail:'请输入 −90° 至 90° 的机械角；已恢复有效设置'}));render();
      }
    });
    host.addEventListener('click',e=>{if(e.target.closest('[data-max-preset]'))api.setMeasurement(MeasurementPlan.pairs());});
  }
  $('#assembly-preview-group').addEventListener('change',e=>selectPreview(+e.target.value));
  workflow.addEventListener('input',e=>{
    const input=e.target;
    if(!input.matches('[data-position-arm]'))return;
    if(input.validity.valid&&input.value!=='')api.setPosition(input.dataset.positionArm,input.valueAsNumber);
    else api.invalidatePosition(input.dataset.positionArm);
  });
  workflow.addEventListener('focusout',e=>{
    const input=e.target;
    if(input.matches('[data-position-arm]')&&(!input.validity.valid||input.value==='')){
      const arm=input.dataset.positionArm,value=api.getMeasurement().workflow.position[arm];
      document.dispatchEvent(new CustomEvent('lab-notice',{detail:'请输入 −90° 至 90° 的机械角；已恢复当前位置'}));
      input.value=value;api.setPosition(arm,value);
    }
  });
  $('#next-group').addEventListener('click',()=>api.nextGroup());
  $('#measurement-reset').addEventListener('click',()=>{window.Lab3D.clearKeys();reset.returnValue='';reset.showModal();});
  reset.addEventListener('close',()=>{if(reset.returnValue==='reset')api.resetMeasurement();});
  function render() {
    const m=api.getMeasurement(),w=m.workflow;
    for(const host of [full,assembly]) {
      host.querySelectorAll('input,button,select').forEach(el=>el.disabled=m.locked);
      host.querySelectorAll('[data-hwp-arm]').forEach(input=>{
        const value=m.groups[+input.dataset.setting][input.dataset.hwpArm];
        if(input.valueAsNumber!==value)input.value=value;
      });
    }
    $('#assembly-preview-group').value=m.active.A;
    for(const arm of ['A','B']){
      const value=m.groups[m.active[arm]][arm];
      assembly.querySelector(`[data-slider-arm=${arm}]`).value=value;
      $('#assembly-preview-'+arm).textContent=fmt(value)+'°';
    }
    const validCHSH=m.prediction.chsh.valid;
    $('#measurement-progress').textContent=w.completed===4?(validCHSH?'已完成 4/4 组，实验 S 已计算':'已完成 4/4 组，四组组合值已计算'):`已完成 ${w.completed}/4 组，S 待计算`;
    const issues=m.prediction.chsh.issues.map(issue=>`${issue.arm} 端第 ${issue.groups.join(' / ')} 组角度不同`).join('；');
    const warning=`${issues}。非 CHSH 配对，|S*| 仅为四个 E 的组合，不适用 2 / 2√2 界限。`;
    $('#chsh-status').hidden=w.completed!==4||validCHSH;
    $('#chsh-status').textContent=warning;
    $('#theory-chsh-status').hidden=validCHSH;$('#theory-chsh-status').textContent=warning;
    const latest=w.groups.at(-1);
    $('#latest-e').textContent=latest?`E${w.completed} = ${latest.E===null?'无有效计数':latest.E.toFixed(5)}`:'尚无记录';
    $('#measurement-ledger').innerHTML=m.groups.map((configured,i)=>{
      const result=w.groups[i],pair=result?{A:result.thetaA,B:result.thetaB}:i===w.current?w.position:configured;
      const status=result?'已记录':i===w.current?'当前组':'已配置';
      return `<tr${i===w.current?' aria-current="step"':''} data-recorded="${!!result}"><th scope="row">E${i+1}<small>${status}</small></th><td>${fmt(pair.A)}° / ${fmt(pair.B)}°</td><td>${result?(result.E===null?'无有效计数':result.E.toFixed(5)):'—'}</td></tr>`;
    }).join('');
    $('#measurement-group-title').textContent=`第 ${w.current+1}/4 组`;
    $('#position-status').textContent=w.done?'E 已记录':w.status==='paused'?'已暂停':w.busy?'采集中 · 角度锁定':w.valid?'可采集':'角度输入无效';
    $('#position-status').dataset.ready=String(w.valid);
    workflow.querySelectorAll('[data-position-arm]').forEach(input=>{
      input.disabled=w.busy||w.done;
      const arm=input.dataset.positionArm,value=w.position[arm];
      if(!(document.activeElement===input&&(!input.validity.valid||input.value===''))&&input.valueAsNumber!==value)input.value=value;
    });
    for(const arm of ['A','B'])$('#analysis-'+arm).textContent=`分析角 ${fmt(2*w.position[arm])}°`;
    $('#current-position').hidden=w.completed===4;
    $('#next-group').hidden=!w.canNext;
    $('#measurement-reset').disabled=w.status==='running';
    $('#measurement-acquisition .run-row').hidden=w.done;
    $('#hwp-model-label').textContent=validCHSH?'当前 V · 无背景理论 |S|':'当前 V · 理论组合 |S*|';
    $('#hwp-model-s').textContent=m.prediction.S.toFixed(5);
    $('#hwp-ideal-s').textContent=m.ideal.S.toFixed(5);
    $('#hwp-e-values').innerHTML=m.prediction.groups.map(g=>`<tr><td>${g.groupId}</td><td>${fmt(g.thetaA)}° / ${fmt(g.thetaB)}°</td><td>${g.E.toFixed(5)}</td></tr>`).join('');
    $('#hwp-lock-status').textContent=m.locked?'装配配置已锁定 · 待测组角度仍可修改':'四组独立角度 · 按实际角度采集';
    $('#assembly-hwp-lock').textContent=m.locked?'本轮装配配置已锁定':'';
    const selected=window.Lab3D.snapshot().selected;
    if(selected?.endsWith('-hwp')&&['A','B'].includes(selected[0]))$('#selected-hwp-label').textContent=`${selected[0]} 端当前机械角 θ`;
  }
  function assemblySelection(id){assembly.hidden=!/^[AB]-hwp$/.test(id);render();}
  document.addEventListener('measurement-change',render);
  document.addEventListener('optic-selected',render);
  document.addEventListener('assembly-selected',e=>assemblySelection(e.detail.id));
  assemblySelection(window.LabAssembly.getSnapshot().current);
})();
