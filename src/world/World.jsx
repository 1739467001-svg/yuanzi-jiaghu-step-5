import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PLACES,AGENTS,THEMES} from './config.js';
import {findPath,hallWalkable,terrainHeight,stepActor} from './engine.js';
import {box,ball,cylinder,mesh,material,building,tree,character,bridge,atomSculpture,textSign,lantern} from './models.js';
import {createCharacter,applyFallbackMotion} from './glb.js';
import {createHallAgents,advanceHallAgent,hallAgentLabel} from './hallAgents.js';
import {trackColorOf} from '../content/catalog.js';
function bubbleTexture(text){
 const c=document.createElement('canvas');c.width=256;c.height=92;const x=c.getContext('2d');
 x.fillStyle='#fbfaf0f2';x.strokeStyle='#aebda0';x.lineWidth=3;
 x.beginPath();x.moveTo(26,10);x.lineTo(230,10);x.quadraticCurveTo(244,10,244,24);x.lineTo(244,56);x.quadraticCurveTo(244,70,230,70);x.lineTo(146,70);x.lineTo(130,82);x.lineTo(118,70);x.lineTo(26,70);x.quadraticCurveTo(12,70,12,56);x.lineTo(12,24);x.quadraticCurveTo(12,10,26,10);x.closePath();x.fill();x.stroke();
 x.fillStyle='#41564a';x.font='500 29px "PingFang SC","Noto Sans SC",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,128,41,214);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
export default function World({engine,theme,night,location,works,onPlace,onAgent,onWork,onSnapshot,apiRef,playerColor,labels=true}){
 const host=useRef(),callbacks=useRef({}),[pins,setPins]=useState([]),[error,setError]=useState(false);callbacks.current={onPlace,onAgent,onWork,onSnapshot};
 useEffect(()=>{
  const el=host.current;let alive=true,renderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{setError(true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=night?1.15:1.25;el.appendChild(renderer.domElement);
  const palette=THEMES[theme]||THEMES.jianghu,scene=new T.Scene();const nightSky=night?(location==='hall'?'#0b1027':'#243e45'):palette.sky;scene.background=new T.Color(nightSky);scene.fog=new T.Fog(nightSky,105,245);
  const camera=new T.PerspectiveCamera(37,1,.1,260);camera.position.set(32,30,39);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=19;controls.maxDistance=160;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.22;controls.enablePan=false;controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.ROTATE};
  scene.add(new T.HemisphereLight(night?'#9fbfce':'#fff8e3',night?'#263b3d':'#9ba994',night?1.5:2.2));const sun=new T.DirectionalLight(night?'#b7d4f0':'#fff1ce',night?1:3.4);sun.position.set(-16,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:80});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);
  const base=new T.Group();scene.add(base);const interactive=[],pinSources=[],agentModels=new Map();
  const ground=box(base,0,-.45,0,39,.8,31,night?'#6d8177':palette.grass);ground.userData.kind='ground';interactive.push(ground);
  box(base,0,-.95,0,39.1,.22,31.1,'#c3bfa7');box(base,0,-1.3,0,38.4,.6,30.4,'#d6cfb8');
  const backdrop=box(scene,0,-1.72,0,1000,.1,1000,night?'#263e43':palette.sky);backdrop.receiveShadow=true;
  const hallPlayer={id:'you',x:0,z:8,angle:0,path:[],state:'看展中'};
 let hallAgents=[],hallStands=[];
  const actorGroup=new T.Group();scene.add(actorGroup);
 // 繁星之夜：夜间星空。小镇稀疏、月亮与流萤；展馆密集并加穹顶，成为一片室内星河。
 let stars,flies,moon;
 if(night){
  // 星星贴近地平线分布：diormama 相机俯视约 31°，可见空域只有地平线上方一条窄带。
  const isHall=location==='hall',count=isHall?420:200,pos=new Float32Array(count*3),col=new Float32Array(count*3);
  for(let i=0;i<count;i++){const t=Math.random()*Math.PI*2,r=45+Math.pow(Math.random(),.7)*105,y=8+Math.random()*15;pos.set([r*Math.cos(t),y,r*Math.sin(t)],i*3);const warm=Math.random()<.34;const c=warm?[1,.85,.62]:[.82,.9,1];col.set(c,i*3);}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(pos,3));sg.setAttribute('color',new T.BufferAttribute(col,3));
  stars=new T.Points(sg,new T.PointsMaterial({size:isHall?2.6:2.2,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.95,fog:false}));scene.add(stars);if(location==='town')window.__dbgStars=stars;
  if(isHall){const dome=new T.Mesh(new T.SphereGeometry(150,24,16),new T.MeshBasicMaterial({color:'#0b1027',side:T.BackSide,fog:false}));scene.add(dome);}
  else{
   moon=new T.Mesh(new T.SphereGeometry(4.6,20,16),new T.MeshBasicMaterial({color:'#f2eedb',fog:false}));moon.position.set(-48,8,-62);scene.add(moon);
   const halo=new T.Mesh(new T.SphereGeometry(7.2,20,16),new T.MeshBasicMaterial({color:'#f2eedb',transparent:true,opacity:.12,fog:false}));halo.position.copy(moon.position);scene.add(halo);
   const fn=14,fp=new Float32Array(fn*3),fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));flies=new T.Points(fg,new T.PointsMaterial({color:'#ffd98a',size:.22,transparent:true,opacity:.85,fog:false}));scene.add(flies);
  }
 }
  const player=createCharacter('character.default',playerColor,1.12);player.userData={...player.userData,kind:'player'};actorGroup.add(player);
  let water,sculpture,bubbles;
  if(location==='town'){
   // The river is blocked by the navigation grid except at the two bridges.
   water=box(base,0,-.02,5,39,.07,3.5,night?'#376d72':'#81b8b2');water.material=new T.MeshStandardMaterial({color:night?'#376d72':'#81b8b2',metalness:.18,roughness:.28});
   for(const z of [3.15,6.85])box(base,0,.03,z,39,.2,.3,'#b5bfac');
   for(let i=0;i<24;i++){const x=-18+(i*7.7)%36,z=4+(i*1.3)%2;box(base,x,.04,z,.4+(i%3)*.28,.014,.04,'#c0d8cc');}
   bridge(base,-4);bridge(base,10);
   box(base,-1,.04,-.5,13,.12,8,'#d4d0b7');box(base,-8,.03,-1,13,.1,2.5,'#d1cdb6');box(base,8,.03,-1,12,.1,2.5,'#d1cdb6');box(base,0,.03,-4,3,.1,5,'#d1cdb6');box(base,-4,.03,10,2.8,.1,9,'#d1cdb6');box(base,10,.03,10,2.8,.1,9,'#d1cdb6');box(base,2,.03,11,18,.1,2.3,'#d1cdb6');
   const stones=new T.InstancedMesh(new T.BoxGeometry(.84,.05,.65),material('#ded9c3'),180),dummy=new T.Object3D();let count=0;
   for(let x=-6;x<6;x++)for(let z=-4;z<5;z++){dummy.position.set(x*.98-.4,.125,z*.76-.5);dummy.rotation.y=((x+z)%3)*.03;dummy.updateMatrix();stones.setMatrixAt(count++,dummy.matrix);}stones.count=count;stones.receiveShadow=true;base.add(stones);
   for(const p of PLACES){const g=building(p,palette.roof);base.add(g);interactive.push(g);pinSources.push({id:p.id,kind:'place',name:p.short,point:new T.Vector3(p.x,p.kind==='hall'?6.9:p.kind==='tea'?6.2:4.9,p.z)});}
   sculpture=atomSculpture(base);
   // Village entrance and hanging sign.
   for(const x of [1,5]){box(base,x,1.7,12,.3,3.4,.3,'#8f7755');box(base,x,.2,12,.7,.4,.7,'#b7b9a2');}box(base,3,3.35,12,5.3,.35,.55,palette.roof);box(base,3,3.65,12,4.7,.22,.75,palette.roof);textSign(base,'原子江湖',3,2.8,12.22,2.4,.7);lantern(base,.7,2.8,12);lantern(base,5.3,2.8,12);
   [[-17,-11,1.1],[-15,-2,.9],[-17,3,1],[-15,13,1.1],[-8,13,.75],[15,-11,1.3],[17,-7,.9],[17,1,.8],[17,12,1.2],[-7,-12,.8],[7,-12,1.1],[6,9,.7]].forEach((a,i)=>tree(base,...a,i===1||i===7||i===9));
   for(let i=0;i<25;i++){const x=-18+(i*13)%36,z=i%2?-13.5:13.7;if(Math.abs(x-3)<3&&z>0)continue;ball(base,x,.16,z,.45,'#9cae8b',[1,.5,.7]);}
   for(const [x,z] of [[-6,2],[5,1],[-7,9],[7,-3],[15,7]]){cylinder(base,x,.2,z,.3,.4,.4,'#bba889');cylinder(base,x,.8,z,.05,.06,1.2,'#786b50');lantern(base,x,1.5,z);if(night){const l=new T.PointLight('#ffb15f',4,5);l.position.set(x,1.4,z);scene.add(l);}}
   // Tea garden seating and a small market stall.
   for(const [x,z] of [[-13,-1],[-9,1]]){cylinder(base,x,.6,z,.55,.55,.13,'#a88c61');cylinder(base,x,.32,z,.15,.22,.5,'#816c4d');for(const dx of [-.9,.9])cylinder(base,x+dx,.3,z,.3,.32,.4,'#bca87d');}
   box(base,7,.7,-8,2,.15,1,'#ac855c'); // colored below
   const stall=base.children.at(-1);stall.material=material('#ac855c');for(const x of [6.1,7.9])box(base,x,1.3,-8,.08,2,.08,'#897350');box(base,7,2.3,-8,2.4,.15,1.6,'#d6b16f');for(let i=0;i<3;i++)ball(base,6.5+i*.4,.9,-8,.15,['#d89467','#9ca57b','#debf75'][i]);
   for(const a of engine.agents){const model=createCharacter('character.default',a.color,.95);model.userData={...model.userData,kind:'agent',id:a.id};actorGroup.add(model);agentModels.set(a.id,model);interactive.push(model);}
   // 社交气泡：两位 AI 侠客闲聊时，头顶浮现当前话题。
   bubbles=new Map(engine.agents.map(a=>{const s=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,depthWrite:false,opacity:1}));s.scale.set(3.1,1.12,1);s.visible=false;scene.add(s);return [a.id,{sprite:s,last:''}];}));
  }else{
   ground.material=material('#c5bea9');box(base,0,.02,0,22,.1,18,'#ddd4ba');
   // Open roof museum: actual 3D exhibition stands with the original posters.
   for(const x of [-11,11])for(const z of [-9,0,9]){cylinder(base,x,2,z,.18,.23,4,'#7a6550');box(base,x,4,z,.6,.22,.6,palette.roof);}box(base,0,4,-9,22,.3,.3,'#8f7959');box(base,0,1.8,-9,22,3.6,.25,'#e9dec4');textSign(base,'武 林 大 会 · 作 品 展',0,3.15,-8.83,8,.8);
   for(const [x,z] of [[-5,-7],[5,-7],[-5,7],[5,7]]){lantern(base,x,3.7,z);if(night){const l=new T.PointLight('#ffb15f',5,10);l.position.set(x,3.4,z);scene.add(l);}}
   const loader=new T.TextureLoader();hallStands=works.slice(0,8).map((w,i)=>({id:w.id,title:w.title,x:(i%4)*4.5-6.75,z:i<4?-5:3}));
   hallStands.forEach((st,i)=>{
    const w=works[i],x=st.x,z=st.z,g=new T.Group();g.position.set(x,0,z);g.userData={kind:'work',id:w.id};base.add(g);interactive.push(g);
    const tc=trackColorOf(w);
    box(g,0,.35,0,2.6,.7,1.5,'#b8ac8e');box(g,0,.75,0,2.8,.13,1.6,'#f0e4ca');box(g,0,2,0,2.2,2.5,.16,'#7e735d');if(tc)box(g,0,2.11,.09,2.24,.05,.02,tc);
    const poster=new T.Mesh(new T.PlaneGeometry(2.05,2.3),new T.MeshStandardMaterial({color:'#eee4d0'}));poster.position.set(0,2.03,.1);g.add(poster);
    loader.load(w.thumb,tex=>{if(!alive){tex.dispose();return;}tex.colorSpace=T.SRGBColorSpace;const aspect=tex.image.width/tex.image.height;poster.scale.x=Math.min(1,aspect*2.3/2.05);poster.scale.y=Math.min(1,2.05/aspect/2.3);poster.material.map=tex;poster.material.color.set('#ffffff');poster.material.needsUpdate=true;});
    textSign(g,w.title.slice(0,12),0,.52,.77,2.4,.28);pinSources.push({id:w.id,kind:'work',name:w.title,point:new T.Vector3(x,3.7,z)});
    if(tc){const pl=new T.PointLight(tc,night?2.6:1.2,7);pl.position.set(x,2.6,z);scene.add(pl);}
   });
   // 展厅里的 AI 侠客：在展位间行走、在展位前驻足观展（PRD H03 的 3D 呈现）。
   const hallAgentStates=createHallAgents(hallStands,AGENTS);
   hallAgents=hallAgentStates.map((ha,i)=>{
    const a=AGENTS[i];
    const model=createCharacter('character.default',a.color,.95);model.userData={...model.userData,kind:'agent',id:a.id};scene.add(model);interactive.push(model);
    const sprite=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,depthWrite:false}));sprite.scale.set(3.1,1.12,1);sprite.visible=false;scene.add(sprite);
    const point=new T.Vector3(ha.x,2.05,ha.z);
    pinSources.push({id:'hall-'+a.id,kind:'agent',name:a.name,point});
    return {...ha,model,sprite,bubble:'',point};
   });
   tree(base,-15,-7,1.4);tree(base,15,-7,1.4);player.position.set(0,0,8);camera.position.set(23,22,29);controls.target.set(0,0,-1);
  }
  const ring=new T.Mesh(new T.RingGeometry(.48,.57,40),new T.MeshBasicMaterial({color:'#fdf2b7',side:T.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.y=.17;scene.add(ring);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),projection=new T.Vector3();let pointerStart=[0,0];
  const down=e=>{pointerStart=[e.clientX,e.clientY];};
  const up=e=>{if(Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(interactive,true);
   for(const hit of hits){let o=hit.object;while(o&&!o.userData.kind)o=o.parent;if(!o)continue;const {kind,id}=o.userData;
    if(kind==='place')callbacks.current.onPlace(id);else if(kind==='agent')callbacks.current.onAgent(id);else if(kind==='work')callbacks.current.onWork(id);else if(kind==='ground'){if(location==='town')engine.movePlayer(hit.point.x,hit.point.z);else hallPlayer.path=findPath([hallPlayer.x,hallPlayer.z],[hit.point.x,hit.point.z],hallWalkable);}break;}
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  let wasNarrow=null;
  function resize(){const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;const narrow=w<550;if(narrow!==wasNarrow){camera.position.set(location==='town'?32:23,location==='town'?30:22,location==='town'?39:29);camera.position.multiplyScalar(narrow?2.05:1);controls.target.set(0,0,0);wasNarrow=narrow;}camera.updateProjectionMatrix();}const observer=new ResizeObserver(resize);observer.observe(el);resize();
  let focusTarget=null,frame,last=performance.now(),lastPins=0;const home=()=>{camera.position.set(location==='town'?32:23,location==='town'?30:22,location==='town'?39:29);if(el.clientWidth<550)camera.position.multiplyScalar(2.05);controls.target.set(0,0,0);focusTarget=null;};
  apiRef.current={reset:home,zoom:v=>{camera.position.sub(controls.target).multiplyScalar(v).add(controls.target);},focus:id=>{const p=PLACES.find(p=>p.id===id);if(p){focusTarget=new T.Vector3(p.x,1,p.z);engine.movePlayer(...p.entry);}},locate:()=>{const current=location==='town'?engine.player:hallPlayer;focusTarget=new T.Vector3(current.x,1,current.z);}};
  function render(now){if(!alive)return;const dt=Math.min((now-last)/1000,.05);last=now;engine.tick(dt);
   if(stars)stars.material.opacity=.72+Math.sin(now*.0007)*.18;
   if(flies){const p=flies.geometry.attributes.position;for(let i=0;i<p.count;i++){const t=now*.00035+i*1.7;p.setXYZ(i,Math.sin(t)*6+((i*7)%13)-6,1.1+Math.sin(now*.0013+i*2.1)*.5,Math.cos(t*1.3)*5+((i*5)%11)-5);}p.needsUpdate=true;}
   if(location==='town'){
    for(const a of engine.agents){const b=bubbles?.get(a.id);if(!b)continue;const topic=(a.memory.at(-1)||'').split('聊起了')[1]||'';
     // 观展中的侠客头顶浮现正在看的作品；闲聊时浮现当前话题。
     const viewing=a.state==='观展中'||(a.task?.type==='observe'&&!a.task.done)?(a.views[0]?.title||a.task?.work?.title||''):'';
     const label=viewing?'观展：《'+(viewing.length>6?viewing.slice(0,6)+'…':viewing)+'》':(a.partner&&topic?'聊起'+(topic.length>7?topic.slice(0,7)+'…':topic):'');
     const show=!!label;
     if(show&&b.last!==label){const short=label.length>9?label.slice(0,9)+'…':label;b.sprite.material.map?.dispose();b.sprite.material.map=bubbleTexture(short);b.sprite.material.needsUpdate=true;b.last=label;}
     b.sprite.visible=show;if(show)b.sprite.position.set(a.x,(terrainHeight(a.x,a.z)||0)+2.85,a.z);}for(const a of [...engine.agents,engine.player]){const m=a.id==='you'?player:agentModels.get(a.id);m.position.set(a.x,terrainHeight(a.x,a.z),a.z);m.rotation.y=a.angle;const moving=a.path.length>0;
    if(m.userData.body){m.userData.body.position.y=moving?Math.abs(Math.sin(now*.009))* .055:Math.sin(now*.002+a.x)*.016;m.userData.feet.forEach((f,i)=>f.position.z=.04+(moving?Math.sin(now*.01+i*Math.PI)*.13:0));if(a.held)m.userData.arms[0].rotation.z=Math.sin(now*.004)*.4;}
    else if(m.userData.glb){const animator=m.userData.glb.animator;if(animator){animator.play(moving?'walk':'idle');animator.update(dt);}else applyFallbackMotion(m,now,moving);}}
    const dest=engine.player.path.at(-1);ring.visible=!!dest;if(dest)ring.position.set(dest[0],terrainHeight(dest[0],dest[1])+.18,dest[1]);
   }else {
    engine.advance(hallPlayer,dt,3.2);player.position.set(hallPlayer.x,0,hallPlayer.z);player.rotation.y=hallPlayer.angle;const dest=hallPlayer.path.at(-1);ring.visible=!!dest;if(dest)ring.position.set(dest[0],.18,dest[1]);if(player.userData.body)player.userData.body.position.y=hallPlayer.path.length?Math.abs(Math.sin(now*.009))*.055:0;else if(player.userData.glb){const animator=player.userData.glb.animator;if(animator){animator.play(hallPlayer.path.length?'walk':'idle');animator.update(dt);}else applyFallbackMotion(player,now,hallPlayer.path.length>0);}
    // 展厅 AI 行为：选一个展位 → 走到展位前 → 驻足观展（朝向展板）→ 下一个。
    for(const ha of hallAgents){
     advanceHallAgent(ha,hallStands,dt);
     ha.model.position.set(ha.x,0,ha.z);ha.model.rotation.y=ha.angle;
     if(ha.model.userData.body){ha.model.userData.body.position.y=ha.path.length?Math.abs(Math.sin(now*.009))* .055:Math.sin(now*.002+ha.x)*.016;ha.model.userData.feet.forEach((f,i)=>f.position.z=.04+(ha.path.length?Math.sin(now*.01+i*Math.PI)*.13:0));}
     else if(ha.model.userData.glb){const animator=ha.model.userData.glb.animator;if(animator){animator.play(ha.path.length?'walk':'idle');animator.update(dt);}else applyFallbackMotion(ha.model,now,ha.path.length>0);}
     ha.point.set(ha.x,2.05,ha.z);
     // 驻足时浮现所看书名气泡。
     const label=hallAgentLabel(ha);
     if(label!==ha.bubble){ha.bubble=label;ha.sprite.material.map?.dispose();ha.sprite.material.map=label?bubbleTexture(label.length>9?label.slice(0,9)+'…':label):null;ha.sprite.material.needsUpdate=true;}
     ha.sprite.visible=!!label;if(label)ha.sprite.position.set(ha.x,2.85,ha.z);
    }
   }
   if(focusTarget){const delta=focusTarget.clone().sub(controls.target).multiplyScalar(.035);controls.target.add(delta);camera.position.add(delta);if(delta.length()<.003)focusTarget=null;}
   controls.update();renderer.render(scene,camera);
   if(now-lastPins>120){lastPins=now;const sources=[...pinSources];{const current=location==='town'?engine.player:hallPlayer;sources.push({id:'you',kind:'player',name:engine.player.name==='你'?'你在这里':engine.player.name,point:new T.Vector3(current.x,2.05+(location==='town'?terrainHeight(current.x,current.z):0),current.z)});};
    const arr=sources.map(p=>{projection.copy(p.point).project(camera);return {...p,x:(projection.x*.5+.5)*el.clientWidth,y:(-.5*projection.y+.5)*el.clientHeight,visible:projection.z<1&&Math.abs(projection.x)<.97&&Math.abs(projection.y)<.96};});setPins(arr);callbacks.current.onSnapshot(engine.snapshot());}
   frame=requestAnimationFrame(render);
  }frame=requestAnimationFrame(render);
  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.map?.dispose();m.dispose();});}});renderer.dispose();el.removeChild(renderer.domElement);};
 },[engine,theme,night,location,works,playerColor]);
 return <><div className="webgl-host" ref={host} data-testid="world-canvas"/>{error?<div className="webgl-error"><h2>当前设备暂不支持 3D</h2><p>仍可完整浏览赛事与作品。</p><button onClick={()=>onPlace('hall')}>打开比赛展示馆</button></div>:labels&&<div className="scene-labels">{pins.filter(p=>p.visible).map(p=><button key={p.id} className={`scene-pin ${p.kind}`} style={{left:p.x,top:p.y}} onClick={()=>p.kind==='place'?onPlace(p.id):p.kind==='work'?onWork(p.id):p.kind==='agent'?onAgent(p.id):apiRef.current?.locate()}>{p.kind==='place'&&<span className="pin-dot"/>}{p.name}{p.kind==='place'&&<span className="pin-arrow">↗</span>}</button>)}</div>}</>;
}
