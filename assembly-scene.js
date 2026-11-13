/* Mount guidance uses the existing objects; it does not alter the CHSH model. */
'use strict';
function createAssemblyScene({T,scene,camera,renderer,objects,assemblyWires,TOP,keys,outline,setBeams,setLabels,resetPreset,clearPreset}) {
  const state = {active:false, selected:null, installed:new Set(), drops:new Map()};
  const group = new T.Group();
  scene.add(group);
  group.visible = false;
  const slots = objects.map((part,index) => {
    const root = new T.Group();
    root.position.set(part.position.x,TOP+.075,part.position.z);
    const material = new T.MeshBasicMaterial({color:'#93b1bd',transparent:true,opacity:.25,side:T.DoubleSide,depthWrite:false,toneMapped:false});
    const ring = new T.Mesh(new T.RingGeometry(.23,.29,48),material);
    ring.rotation.x = -Math.PI/2;
    root.add(ring);
    const hit = new T.Mesh(new T.CircleGeometry(.34,32),new T.MeshBasicMaterial({transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));
    hit.rotation.x = -Math.PI/2;
    hit.userData.slotId = part.userData.id;
    root.add(hit);
    group.add(root);
    return {root,ring,hit,part,index};
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function sync() {
    group.visible = state.active;
    outline.visible = false;
    objects.forEach(part => {
      part.visible = !state.active || state.installed.has(part.userData.id);
      part.position.y = 0;
    });
    assemblyWires.forEach(wire => wire.visible = !state.active || state.installed.size === objects.length);
    slots.forEach(slot => slot.root.visible = !state.installed.has(slot.part.userData.id));
    if(state.active) { setBeams(false); setLabels(false); }
  }
  function focus(id) {
    const slot = slots.find(s => s.part.userData.id === id);
    if(!slot) return;
    const p = slot.root.position;
    const narrow = innerWidth < 900 && !(innerWidth>=600 && innerHeight<=560);
    camera.clearViewOffset();
    camera.position.set(p.x+2.2,p.y+5.9,p.z+5.8);
    camera.lookAt(p.x,p.y+.4,p.z);
    camera.rotation.order = 'YXZ';
    if(narrow) camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.17,innerWidth,innerHeight);
    clearPreset();
    keys.clear();
  }
  function position(id) {
    const slot = slots.find(s => s.part.userData.id === id);
    if(!slot) return null;
    const v = slot.root.position.clone();
    v.y += .12;
    v.project(camera);
    return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,depth:v.z};
  }
  function thumbnails() {
    const preview = new T.Scene();
    preview.background = new T.Color('#2b393f');
    preview.add(new T.HemisphereLight('#f3f9ff','#596868',3));
    const light = new T.DirectionalLight('#ffffff',3);
    light.position.set(3,5,4);
    preview.add(light);
    const cam = new T.PerspectiveCamera(36,1.25,.01,100);
    const images = {};
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setSize(240,192,false);
    for(const part of objects) {
      // Reuse meshes: picking metadata contains parent references and is not cloneable JSON.
      const parent=part.parent, savedPosition=part.position.clone(), savedVisible=part.visible;
      part.visible = true;
      preview.add(part);
      const bounds = new T.Box3().setFromObject(part);
      const size = bounds.getSize(new T.Vector3());
      part.position.sub(bounds.getCenter(new T.Vector3()));
      const distance = Math.max(size.x/1.25,size.y,size.z)*2;
      cam.position.set(distance*.7,distance*.42,distance);
      cam.lookAt(0,0,0);
      renderer.render(preview,cam);
      images[part.userData.id] = renderer.domElement.toDataURL('image/png');
      part.position.copy(savedPosition);
      part.visible=savedVisible;
      parent.add(part);
    }
    renderer.shadowMap.enabled = shadows;
    renderer.setSize(innerWidth,innerHeight,false);
    return images;
  }
  scene.onBeforeRender = () => {
    if(!state.active) return;
    const ms = performance.now();
    for(const slot of slots) {
      const id = slot.part.userData.id;
      const active = id === state.selected;
      const pulse = reducedMotion.matches ? 0 : Math.sin(ms*.004);
      slot.ring.material.color.set(active ? '#69e1f2' : '#98b0b7');
      slot.ring.material.opacity = active ? .77+.20*pulse : .25;
      slot.ring.scale.setScalar(active ? 1.12+.06*pulse : 1);
      const start = state.drops.get(id);
      if(start !== undefined) {
        const t = Math.min(1,(ms-start)/300);
        slot.part.position.y = .65*(1-t)**3;
        if(t === 1) state.drops.delete(id);
      }
    }
  };
  return {
    get active() { return state.active; },
    catalog:() => objects.map((part,index) => ({id:part.userData.id,name:part.userData.name,index:index+1})),
    thumbnails,focus,position,
    enter(installed) { state.active=true; state.installed=new Set(installed); state.drops.clear(); sync(); resetPreset('top'); },
    leave() { state.active=false; state.drops.clear(); camera.clearViewOffset(); sync(); resetPreset('overview'); },
    select(id,move=true) { state.selected=id; if(move) focus(id); },
    install(id) {
      if(!state.active || !objects.some(p => p.userData.id===id) || state.installed.has(id)) return false;
      state.installed.add(id); sync();
      if(!reducedMotion.matches) state.drops.set(id,performance.now());
      return true;
    },
    remove(id) { state.installed.delete(id); state.drops.delete(id); sync(); },
    pick(ray) {
      if(!state.active) return false;
      const hit = ray.intersectObjects(slots.filter(s => s.root.visible).map(s => s.hit),false)[0];
      if(hit) document.dispatchEvent(new CustomEvent('assembly-slot',{detail:hit.object.userData.slotId}));
      return !!hit;
    },
    snapshot:() => ({active:state.active,selected:state.selected,installed:[...state.installed],visible:objects.filter(p => p.visible).map(p => p.userData.id)})
  };
}
