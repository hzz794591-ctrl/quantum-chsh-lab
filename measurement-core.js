(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeasurementPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = () => ({A:[0,22.5],B:[11.25,33.75]});
  function validate(settings) {
    const copy = {};
    for (const arm of ['A','B']) {
      if (!Array.isArray(settings?.[arm]) || settings[arm].length !== 2)
        throw new RangeError('Each arm requires two half-wave plate settings');
      copy[arm] = settings[arm].map(value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 90)
          throw new RangeError('Half-wave plate angles must be between -90 and 90 degrees');
        return value;
      });
    }
    return copy;
  }
  function pairs(settings = defaults()) {
    const hwp=validate(settings);
    return [0,1,2,3].map(i=>({A:hwp.A[Math.floor(i/2)],B:hwp.B[i%2]}));
  }
  function validateGroups(values) {
    if(!Array.isArray(values)||values.length!==4)throw new RangeError('Four angle pairs are required');
    return values.map(pair=>{
      const copy={};
      for(const arm of ['A','B']){
        const value=pair?.[arm];
        if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>90)
          throw new RangeError('Half-wave plate angles must be between -90 and 90 degrees');
        copy[arm]=value;
      }
      return copy;
    });
  }
  function consistency(values) {
    const p=validateGroups(values),issues=[];
    // A 90-degree mechanical rotation preserves the labeled H/V projectors.
    for(const [arm,i,j] of [['A',0,1],['A',2,3],['B',0,2],['B',1,3]]){
      const d=(p[i][arm]-p[j][arm])/90;
      if(Math.abs(d-Math.round(d))>1e-10)issues.push({arm,groups:[i+1,j+1]});
    }
    return {valid:issues.length===0,issues};
  }
  function createGroups(values = pairs()) {
    const settings=validateGroups(values), rows=[], groups=[];
    for (let n=0;n<4;n++) {
      const i=Math.floor(n/2),j=n%2,groupId=n+1,thetaA=settings[n].A,thetaB=settings[n].B;
      const group = {groupId,aSetting:i,bSetting:j,thetaA,thetaB,a:2*thetaA,b:2*thetaB,
        sign:i===0&&j===1?-1:1,ids:[]};
      // A single-channel analyzer samples orthogonal outputs by rotating its HWP 45 degrees.
      for (let outcome=0;outcome<4;outcome++) {
        const ta=thetaA-(outcome>=2?45:0), tb=thetaB-(outcome%2?45:0);
        const id=rows.length+1;
        rows.push({id,groupId,aSetting:i,bSetting:j,aIndex:2*i+(outcome>=2?1:0),bIndex:2*j+outcome%2,outcome:['++','+-','-+','--'][outcome],
          thetaA:ta,thetaB:tb,a:2*ta,b:2*tb});
        group.ids.push(id);
      }
      groups.push(group);
    }
    const chsh=consistency(settings);
    return {settings,hwp:chsh.valid?{A:[settings[0].A,settings[2].A],B:[settings[0].B,settings[1].B]}:null,chsh,groups,rows};
  }
  function create(settings = defaults()) {
    return createGroups(pairs(settings));
  }
  function predictionGroups(settings, visibility=1) {
    if (!Number.isFinite(visibility) || visibility<0 || visibility>1) throw new RangeError('Invalid visibility');
    const p=createGroups(settings),groups=p.groups.map(g=>({...g,E:-visibility*Math.cos(4*(g.thetaA-g.thetaB)*Math.PI/180)}));
    return {groups,chsh:p.chsh,S:Math.abs(groups.reduce((total,g)=>total+g.sign*g.E,0))};
  }
  function prediction(settings, visibility=1) {return predictionGroups(pairs(settings),visibility);}
  return {defaults,validate,pairs,validateGroups,consistency,createGroups,create,predictionGroups,prediction};
});
