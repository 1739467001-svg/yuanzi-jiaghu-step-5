import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PLACES,THEMES} from './config.js';
import {findPath,walkable,stepActor,terrainHeight} from './engine.js';
import {box,ball,cylinder,material,building,tree,character,bridge,atomSculpture,textSign,lantern} from './models.js';
import {createCharacter,applyFallbackMotion} from './glb.js';

// 远程玩家气泡：私聊中的“交谈中”与公开表情（内容不可见，PRD 9.1 旁观规则）。
const EMOTE_LABELS={wave:'打招呼',bow:'作揖',clap:'鼓掌',think:'思考'};
function bubbleTexture(text){
 const c=document.createElement('canvas');c.width=256;c.height=92;const x=c.getContext('2d');
 x.fillStyle='#fbfaf0f2';x.strokeStyle='#aebda0';x.lineWidth=3;
 x.beginPath();x.moveTo(26,10);x.lineTo(230,10);x.quadraticCurveTo(244,10,244,24);x.lineTo(244,56);x.quadraticCurveTo(244,70,230,70);x.lineTo(146,70);x.lineTo(130,82);x.lineTo(118,70);x.lineTo(26,70);x.quadraticCurveTo(12,70,12,56);x.lineTo(12,24);x.quadraticCurveTo(12,10,26,10);x.closePath();x.fill();x.stroke();
 x.fillStyle='#41564a';x.font='500 29px "PingFang SC","Noto Sans SC",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,128,41,214);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

// 联机世界：服务端权威位置，客户端本地预测 + 快照插值。
// 自己的角色立即响应点击（预测），其他人的角色按 10Hz 快照插值；
// 与服务端偏差过大时以服务端位置纠正。模型不得直接执行坐标修改。
export default function OnlineWorld({client,theme,night,labels=true,playerColor,onPlayers,onPlace,onActor,apiRef}){
 const host=useRef(),callbacks=useRef({});callbacks.current={onPlayers,onPlace,onActor};
 const [error,setError]=useState(false),[pins,setPins]=useState([]);
 const selfRef=useRef({x:-3,z:1,angle:0,path:[],id:'you',state:'自在漫游'});
 const selfId=useRef(null);
 const selfSeat=useRef(null);
 const remoteRef=useRef(new Map());
 useEffect(()=>{
  const el=host.current;let alive=true,renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{setError(true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneExposure=night?1.15:1.25;el.appendChild(renderer.domElement);
  const palette=THEMES[theme]||THEMES.jianghu,scene=new T.Scene();
  const nightSky=night?'#243e45':palette.sky;scene.background=new T.Color(nightSky);scene.fog=new T.Fog(nightSky,105,245);
  const camera=new T.PerspectiveCamera(37,1,.1,260);camera.position.set(32,30,39);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=19;controls.maxDistance=160;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.22;controls.enablePan=false;controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.ROTATE};
  scene.add(new T.HemisphereLight(night?'#9fbfce':'#fff8e3',night?'#263b3d':'#9ba994',night?1.5:2.2));const sun=new T.DirectionalLight(night?'#b7d4f0':'#fff1ce',night?1:3.4);sun.position.set(-16,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:80});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);
  const base=new T.Group();scene.add(base);const interactive=[],pinSources=[],models=new Map();
  const ground=box(base,0,-.45,0,39,.8,31,night?'#6d8177':palette.grass);ground.userData.kind='ground';interactive.push(ground);
  box(base,0,-.95,0,39.1,.22,31.1,'#c3bfa7');box(base,0,-1.3,0,38.4,.6,30.4,'#d6cfb8');
  const backdrop=box(scene,0,-1.72,0,1000,.1,1000,night?'#263e43':palette.sky);backdrop.receiveShadow=true;
  let stars,flies,moon;
  if(night){
   const count=200,pos=new Float32Array(count*3),col=new Float32Array(count*3);
   for(let i=0;i<count;i++){const t=Math.random()*Math.PI*2,r=45+Math.pow(Math.random(),.7)*105,y=8+Math.random()*15;pos.set([r*Math.cos(t),y,r*Math.sin(t)],i*3);const warm=Math.random()<.34;const c=warm?[1,.85,.62]:[.82,.9,1];col.set(c,i*3);}
   const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(pos,3));sg.setAttribute('color',new T.BufferAttribute(col,3));
   stars=new T.Points(sg,new T.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.95,fog:false}));scene.add(stars);
   moon=new T.Mesh(new T.SphereGeometry(4.6,20,16),new T.MeshBasicMaterial({color:'#f2eedb',fog:false}));moon.position.set(-48,8,-62);scene.add(moon);
   const halo=new T.Mesh(new T.SphereGeometry(7.2,20,16),new T.MeshBasicMaterial({color:'#f2eedb',transparent:true,opacity:.12,fog:false}));halo.position.copy(moon.position);scene.add(halo);
   const fn=14,fp=new Float32Array(fn*3),fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));flies=new T.Points(fg,new T.PointsMaterial({color:'#ffd98a',size:.22,transparent:true,opacity:.85,fog:false}));scene.add(flies);
  }
  const player=createCharacter('character.default',playerColor,1.12);player.userData={...player.userData,kind:'player'};scene.add(player);
  const water=box(base,0,-.02,5,39,.07,3.5,night?'#376d72':'#81b8b2');water.material=new T.MeshStandardMaterial({color:night?'#376d72':'#81b8b2',metalness:.18,roughness:.28});
  for(const z of [3.15,6.85])box(base,0,.03,z,39,.2,.3,'#b5bfac');
  for(let i=0;i<24;i++){const x=-18+(i*7.7)%36,z=4+(i*1.3)%2;box(base,x,.04,z,.4+(i%3)*.28,.014,.04,'#c0d8cc');}
  bridge(base,-4);bridge(base,10);
  box(base,-1,.04,-.5,13,.12,8,'#d4d0b7');box(base,-8,.03,-1,13,.1,2.5,'#d1cdb6');box(base,8,.03,-1,12,.1,2.5,'#d1cdb6');box(base,0,.03,-4,3,.1,5,'#d1cdb6');box(base,-4,.03,10,2.8,.1,9,'#d1cdb6');box(base,10,.03,10,2.8,.1,9,'#d1cdb6');box(base,2,.03,11,18,.1,2.3,'#d1cdb6');
  for(const p of PLACES){const g=building(p,palette.roof);base.add(g);interactive.push(g);pinSources.push({id:p.id,kind:'place',name:p.short,point:new T.Vector3(p.x,p.kind==='hall'?6.9:p.kind==='tea'?6.2:4.9,p.z)});}
  atomSculpture(base);
  for(const x of [1,5]){box(base,x,1.7,12,.3,3.4,.3,'#8f7755');box(base,x,.2,12,.7,.4,.7,'#b7b9a2');}box(base,3,3.35,12,5.3,.35,.55,palette.roof);box(base,3,3.65,12,4.7,.22,.75,palette.roof);textSign(base,'原子江湖',3,2.8,12.22,2.4,.7);lantern(base,.7,2.8,12);lantern(base,5.3,2.8,12);
  [[-17,-11,1.1],[-15,-2,.9],[-17,3,1],[-15,13,1.1],[-8,13,.75],[15,-11,1.3],[17,-7,.9],[17,1,.8],[17,12,1.2],[-7,-12,.8],[7,-12,1.1],[6,9,.7]].forEach((a,i)=>tree(base,...a,i===1||i===7||i===9));
  for(let i=0;i<25;i++){const x=-18+(i*13)%36,z=i%2?-13.5:13.7;if(Math.abs(x-3)<3&&z>0)continue;ball(base,x,.16,z,.45,'#9cae8b',[1,.5,.7]);}
  for(const [x,z] of [[-6,2],[5,1],[-7,9],[7,-3],[15,7]]){cylinder(base,x,.2,z,.3,.4,.4,'#bba889');cylinder(base,x,.8,z,.05,.06,1.2,'#786b50');lantern(base,x,1.5,z);if(night){const l=new T.PointLight('#ffb15f',4,5);l.position.set(x,1.4,z);scene.add(l);}}
  const ring=new T.Mesh(new T.RingGeometry(.48,.57,40),new T.MeshBasicMaterial({color:'#fdf2b7',side:T.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.y=.17;scene.add(ring);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();let pointerStart=[0,0];
  const down=e=>{pointerStart=[e.clientX,e.clientY];};
  const up=e=>{if(Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(interactive,true);
   for(const hit of hits){let o=hit.object;while(o&&!o.userData.kind)o=o.parent;if(!o)continue;const {kind,id}=o.userData;
    if(kind==='place')callbacks.current.onPlace(id);
    else if(kind==='remote')callbacks.current.onActor(id);
    else if(kind==='ground'&&walkable(Math.round(hit.point.x),Math.round(hit.point.z))){
     const self=selfRef.current;self.path=findPath([self.x,self.z],[Math.round(hit.point.x),Math.round(hit.point.z)]);self.state='正在前往';
     client?.move(hit.point.x,hit.point.z);
    }
    break;}
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  function resize(){const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const home=()=>{camera.position.set(32,30,39);controls.target.set(0,0,0);};
  let focusTarget=null;
  apiRef.current={
   reset:home,
   zoom:v=>{camera.position.sub(controls.target).multiplyScalar(v).add(controls.target);},
   locate:()=>{const self=selfRef.current;controls.target.set(self.x,1,self.z);camera.position.set(self.x+32,31,self.z+39);},
   focus:id=>{const p=PLACES.find(p=>p.id===id);if(!p)return;focusTarget=new T.Vector3(p.x,1,p.z);const self=selfRef.current;self.path=findPath([self.x,self.z],p.entry);self.state='正在前往';client?.move(p.entry[0],p.entry[1]);},
  };
  // 快照 → 远程角色目标位置；自己的角色以服务端位置纠正预测偏差。
  const onSnapshot=data=>{
   const remote=remoteRef.current;
   const seenIds=new Set();
   for(const a of data.actors||[]){
    if(a.id===selfId.current){
     // 服务端位置权威：预测与服务端有偏差时温和收敛，保持行走连续；
     // 只有大幅脱节（重连、接管）才直接采用服务端位置。
     const self=selfRef.current,dx=a.x-self.x,dz=a.z-self.z,dist=Math.hypot(dx,dz);
     if(dist>3){self.x=a.x;self.z=a.z;self.path=[];}
     else if(dist>.05){self.x+=dx*.25;self.z+=dz*.25;}
     continue;
    }
    seenIds.add(a.id);
    let entry=remote.get(a.id);
    // 展开保留 character() 设置的 body/feet/arms，只追加交互标识。
    if(!entry){
     const model=createCharacter('character.default',a.color,.95);model.userData={...model.userData,kind:'remote',id:a.id};scene.add(model);interactive.push(model);
     const sprite=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,depthWrite:false}));sprite.scale.set(3.1,1.12,1);sprite.visible=false;scene.add(sprite);
     entry={model,x:a.x,z:a.z,tx:a.x,tz:a.z,angle:a.angle,sprite,bubble:'',emoteUntil:0};
     remote.set(a.id,entry);
    }
    entry.tx=a.x;entry.tz=a.z;entry.angle=a.angle;entry.chat=a.chat;entry.seat=a.seat||null;entry.state=a.state;entry.name=a.name;
   }
   for(const [id,entry] of [...remote])if(!seenIds.has(id)){scene.remove(entry.model);scene.remove(entry.sprite);const at=interactive.indexOf(entry.model);if(at>=0)interactive.splice(at,1);remote.delete(id);}
   callbacks.current.onPlayers?.((data.actors||[]).filter(a=>a.id!==selfId.current));
  };
  // 采用服务端分配的出生点与账号身份，避免客户端假设位置与服务端不一致。
  if(client&&!client.handlers.__worldWrapped){
   const appWelcome=client.handlers.onWelcome;
   client.handlers.onWelcome=data=>{
    const self=selfRef.current;
    if(data?.you){self.x=data.you.x;self.z=data.you.z;self.path=[];selfId.current=data.you.id;}
    appWelcome?.(data);
   };
   client.handlers.__worldWrapped=true;
  }
  if(client&&!client.handlers.__emoteWrapped){
   const appEmote=client.handlers.onEmote;
   client.handlers.onEmote=data=>{
    const entry=remoteRef.current.get(data.from);
    if(entry){entry.emoteUntil=performance.now()+3000;entry.emote=data.emote;}
    appEmote?.(data);
   };
   client.handlers.__emoteWrapped=true;
  }
  if(client&&!client.handlers.__sitWrapped){
   const appSitOk=client.handlers.onSitOk,appStandOk=client.handlers.onStandOk;
   client.handlers.onSitOk=data=>{
    const self=selfRef.current;
    if(data.seat){self.x=data.seat.x;self.z=data.seat.z;self.angle=data.seat.angle;self.path=[];selfSeat.current=data.seat.id;}
    appSitOk?.(data);
   };
   client.handlers.onStandOk=data=>{selfSeat.current=null;appStandOk?.(data);};
   client.handlers.__sitWrapped=true;
  }
  if(client)client.handlers.onSnapshot=onSnapshot;
  let frame,last=performance.now(),lastPins=0;
  function render(now){
   if(!alive)return;const dt=Math.min((now-last)/1000,.05);last=now;
   if(stars)stars.material.opacity=.72+Math.sin(now*.0007)*.18;
   if(flies){const p=flies.geometry.attributes.position;for(let i=0;i<p.count;i++){const t=now*.00035+i*1.7;p.setXYZ(i,Math.sin(t)*6+((i*7)%13)-6,1.1+Math.sin(now*.0013+i*2.1)*.5,Math.cos(t*1.3)*5+((i*5)%11)-5);}p.needsUpdate=true;}
   const self=selfRef.current;if(!selfSeat.current)stepActor(self,dt,3.2);
   window.__atomOnlineSelf={x:self.x,z:self.z,state:self.state,seat:selfSeat.current};
   player.position.set(self.x,(terrainHeight(self.x,self.z)||0)-(selfSeat.current?.28:0),self.z);player.rotation.y=self.angle;
   const moving=self.path.length>0&&!selfSeat.current;
   if(player.userData.body){player.userData.body.position.y=moving?Math.abs(Math.sin(now*.009))*.055:Math.sin(now*.002+self.x)*.016;player.userData.feet.forEach((f,i)=>f.position.z=.04+(moving?Math.sin(now*.01+i*Math.PI)*.13:0));}
   else if(player.userData.glb){const animator=player.userData.glb.animator;if(animator){animator.play(moving?'walk':'idle');animator.update(dt);}else applyFallbackMotion(player,now,moving);}
   const dest=self.path.at(-1);ring.visible=!!dest;if(dest)ring.position.set(dest[0],terrainHeight(dest[0],dest[1])+.18,dest[1]);
   for(const [id,entry] of remoteRef.current){
    entry.x+=(entry.tx-entry.x)*Math.min(1,dt*9);entry.z+=(entry.tz-entry.z)*Math.min(1,dt*9);
    entry.model.position.set(entry.x,(terrainHeight(entry.x,entry.z)||0)-(entry.seat?.28:0),entry.z);entry.model.rotation.y=entry.angle;
    if(entry.model.userData.body)entry.model.userData.body.position.y=Math.sin(now*.002+entry.x)*.016;
    else if(entry.model.userData.glb){const animator=entry.model.userData.glb.animator;if(animator){animator.play('idle');animator.update(dt);}else applyFallbackMotion(entry.model,now,false);}
    // 气泡：私聊中显示“交谈中”（内容不可见），否则显示 3 秒内的公开表情。
    const emoteActive=now<entry.emoteUntil;
    const label=entry.chat?'交谈中':(emoteActive?(EMOTE_LABELS[entry.emote]||'打招呼'):'');
    if(label!==entry.bubble){
     entry.bubble=label;
     entry.sprite.material.map?.dispose();
     entry.sprite.material.map=label?bubbleTexture(label):null;
     entry.sprite.material.needsUpdate=true;
    }
    entry.sprite.visible=!!label;
    if(label)entry.sprite.position.set(entry.x,(terrainHeight(entry.x,entry.z)||0)+2.85,entry.z);
   }
   controls.update();renderer.render(scene,camera);
   if(focusTarget){const delta=focusTarget.clone().sub(controls.target).multiplyScalar(.035);controls.target.add(delta);camera.position.add(delta);if(delta.length()<.003)focusTarget=null;}
   if(now-lastPins>120){
    lastPins=now;
    const sources=[...pinSources];
    for(const [id,entry] of remoteRef.current)sources.push({id,kind:'remote',name:entry.name,point:new T.Vector3(entry.x,2.05+terrainHeight(entry.x,entry.z),entry.z)});
    sources.push({id:'you',kind:'player',name:'你在这里',point:new T.Vector3(self.x,2.05+terrainHeight(self.x,self.z),self.z)});
    const projection=new T.Vector3();
    const arr=sources.map(p=>{projection.copy(p.point).project(camera);return {...p,x:(projection.x*.5+.5)*el.clientWidth,y:(-.5*projection.y+.5)*el.clientHeight,visible:projection.z<1&&Math.abs(projection.x)<.97&&Math.abs(projection.y)<.96};});
    setPins(arr);
   }
   frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.map?.dispose();m.dispose();});}});renderer.dispose();el.removeChild(renderer.domElement);};
 },[client,theme,night,playerColor]);
 return <><div className="webgl-host" ref={host} data-testid="world-canvas"/>{error?<div className="webgl-error"><h2>当前设备暂不支持 3D</h2><p>联机世界需要 WebGL。</p></div>:labels&&<div className="scene-labels">{pins.filter(p=>p.visible).map(p=><button key={p.id} className={`scene-pin ${p.kind}`} style={{left:p.x,top:p.y}} onClick={()=>p.kind==='place'?callbacks.current.onPlace(p.id):p.kind==='remote'?callbacks.current.onActor(p.id):apiRef.current?.locate()}>{p.kind==='place'&&<span className="pin-dot"/>}{p.name}{p.kind==='place'&&<span className="pin-arrow">↗</span>}</button>)}</div>}</>;
}
