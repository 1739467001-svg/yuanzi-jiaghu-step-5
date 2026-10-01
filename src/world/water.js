// 小镇水景与河中生态（程序化，无外部素材）：
// - 水面：桌面端用 Reflector 做真实平面反射，上面叠一层正弦波动着色器（flowing water）；
//   手机端降级为天空色 + 波动（不做反射，保帧率）。
// - 生态：锦鲤巡游（偶尔浮头吐泡）、青蛙蹲荷叶（定时起跳溅水）、蝌蚪群（浅水）、
//   蜻蜓点水（留下扩散涟漪）、荷叶与睡莲。
import * as T from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {box,ball,cylinder,mesh,material} from './models.js';

const WATER_VERT=`
 uniform float uTime;
 varying vec2 vUv;
 varying float vWave;
 void main(){
  vUv=uv;
  vec3 p=position;
  float w=sin(p.x*.55+uTime*1.15)*.075
          +sin(p.y*.42-uTime*.85)*.06
          +sin((p.x+p.y)*.31+uTime*1.6)*.04;
  p.z+=w;
  vWave=w;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
 }`;
const WATER_FRAG=`
 uniform vec3 uShallow;
 uniform vec3 uDeep;
 uniform float uTime;
 uniform float uNight;
 varying vec2 vUv;
 varying float vWave;
 void main(){
  float depth=smoothstep(-.09,.09,vWave);
  vec3 col=mix(uDeep,uShallow,depth);
  // 波峰高光：让水面有"反光"的刺亮点
  float glint=smoothstep(.045,.085,vWave);
  col+=glint*(uNight>.5?vec3(.35,.45,.55):vec3(.5,.52,.45))*.6;
  // 岸边浅滩渐亮
  float shore=smoothstep(.42,.0,abs(vUv.y-.5));
  col=mix(col,col*1.18,shore*.5);
  gl_FragColor=vec4(col,1.0);
 }`;

// ---- 锦鲤：身体 + 双尾 + 背鳍，沿水面缓慢巡游，偶尔加速 ----
function koi(parent,x0,z0,color,seed){
 const g=new T.Group();
 const body=new T.Mesh(new T.SphereGeometry(.36,12,9),new T.MeshStandardMaterial({color,roughness:.35,metalness:.1}));
 body.scale.set(1,.62,1.75);g.add(body);
 ball(g,-.34,.02,0,.15,'#fff9ed',[1,.85,1.5]);
 ball(g,.34,.04,0,.15,'#fff9ed',[1,.85,1.5]);
 ball(g,0,.06,.28,.07,'#fff9ed',[1,.6,1]);            // 唇
 for(const sz of [-1,1]){
  const tail=new T.Mesh(new T.ConeGeometry(.26,.62,5),new T.MeshStandardMaterial({color,side:T.DoubleSide}));
  tail.position.z=sz*.62;tail.rotation.x=sz>0?Math.PI:0;g.add(tail);
 }
 const fin=new T.Mesh(new T.ConeGeometry(.12,.34,4),new T.MeshStandardMaterial({color}));
 fin.position.y=.24;fin.rotation.x=Math.PI;g.add(fin);
 g.position.set(x0,.14,z0);
 parent.add(g);
 const state={g,r:12+seed*3,x:x0,z:z0,speed:.22+seed*.06,phase:seed*2.1,turn:0};
 g.userData.koi=state;
 return state;
}

// ---- 青蛙：蹲荷叶上，定时起跳落到另一片荷叶 ----
function frog(parent,x,z,padR){
 const g=new T.Group();
 const body=new T.Mesh(new T.SphereGeometry(.3,10,8),new T.MeshStandardMaterial({color:'#6f9a4e',roughness:.75}));
 body.scale.set(1.15,.85,1.35);body.position.y=.3;g.add(body);
 for(const sz of [-1,1]){
  ball(g,sz*.22,.34,.16,.09,'#6f9a4e',[1,.8,1.1]);   // 眼睑
  ball(g,sz*.22,.38,.2,.055,'#f2e8c8',[1,1,1.2]);    // 眼白
  ball(g,sz*.22,.38,.24,.03,'#22261f',[1,1,1]);
 }
 for(const sx of [-1,1])for(const sz of [-1,1]){const leg=ball(g,sx*.24,.12,sz*.22,.1,'#5f8a42',[.8,1,.8]);leg.rotation.z=sx*.5;}
 g.position.set(x,.16,z);parent.add(g);
 return {g,x,z,homeY:.16,hopT:2+Math.random()*4,jumping:false,jumpT:0,from:{x,z},to:{x,z}};
}

// ---- 蝌蚪：小群黑点 + 摆尾 ----
function tadpoles(parent,cx,cz,count){
 const g=new T.Group();g.position.set(cx,.12,cz);parent.add(g);
 const ones=[];
 for(let i=0;i<count;i++){
  const t=new T.Group();
  const b=ball(t,0,0,0,.055,'#2b2f28',[1.4,1,1]);
  const tail=cylinder(t,0,0,.12,.012,.008,.22,'#2b2f28',5);tail.rotation.x=Math.PI/2;
  const a=Math.random()*Math.PI*2,r=Math.random()*2.4;
  t.position.set(Math.cos(a)*r,0,Math.sin(a)*r);g.add(t);
  ones.push({t,a,r,speed:.5+Math.random()*.5});
 }
 return {g,ones};
}

// ---- 蜻蜓：点水，留下扩散涟漪 ----
function dragonfly(parent,x,z,seed){
 const g=new T.Group();
 const body=cylinder(g,0,.5,0,.022,.03,.5,'#3f6f8a',6);body.rotation.x=Math.PI/2;
 const tail=cylinder(g,0,.5,.3,.014,.02,.5,'#3f6f8a',6);tail.rotation.x=Math.PI/2;
 for(const sz of [-1,1]){
  const w=new T.Mesh(new T.PlaneGeometry(1.5,.42),new T.MeshStandardMaterial({color:'#cfe6ee',transparent:true,opacity:.75,side:T.DoubleSide}));
  w.position.set(sz*.5,.54,0);w.rotation.x=-Math.PI/2;g.add(w);
 }
 g.position.set(x,1.6,z);parent.add(g);
 return {g,x,z,phase:seed*2.4,speed:.5+seed*.2};
}

// 涟漪环：鱼跃/蛙跳/蜻蜓点水时扩散
function ripples(parent,pool=10){
 const rings=[];
 for(let i=0;i<pool;i++){
  const m=new T.Mesh(new T.RingGeometry(.18,.26,28),new T.MeshBasicMaterial({color:'#eef7f5',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.visible=false;parent.add(m);rings.push({m,life:0});
 }
 let cursor=0;
 return {
  spawn(x,z){const r=rings[cursor++%pool];r.m.position.set(x,.1,z);r.m.visible=true;r.life=0;r.m.material.opacity=.75;r.m.scale.setScalar(.5);},
  update(dt){
   for(const r of rings){
    if(!r.m.visible)continue;
    r.life+=dt;
    const t=r.life/1.1;
    if(t>=1){r.m.visible=false;continue;}
    r.m.scale.setScalar(.5+t*3.4);
    r.m.material.opacity=.75*(1-t);
   }
  },
 };
}

// 全镇共用的水景 + 生态。quality='low' 时跳过平面反射（手机）。
export function createWater(parent,{night=false,quality='high'}={}){
 const g=new T.Group();parent.add(g);
 // 河床与岸
 const bed=mesh(new T.BoxGeometry(39,1.2,9),material(night?'#204a4a':'#3f7a72'),g,0,-.62,0);
 bed.position.y=-.62;
 // 反射层（桌面端）+ 波动层
 let reflector=null;
 if(quality!=='low'){
  try{
   reflector=new Reflector(new T.PlaneGeometry(39,9),{clipBias:.003,textureWidth:512,textureHeight:256,color:night?0x1d3a42:0x6fb3ae});
   reflector.rotation.x=-Math.PI/2;reflector.position.set(0,-.02,0);g.add(reflector);
  }catch{reflector=null;}
 }
 const waveUniforms={
  uTime:{value:0},
  uShallow:{value:new T.Color(night?'#3f7f88':'#9ad2cd')},
  uDeep:{value:new T.Color(night?'#173038':'#4a8b8e')},
  uNight:{value:night?1:0},
 };
 const waveMat=new T.ShaderMaterial({
  uniforms:waveUniforms,vertexShader:WATER_VERT,fragmentShader:WATER_FRAG,transparent:!reflector,opacity:.92,
 });
 const waves=new T.Mesh(new T.PlaneGeometry(39,9,72,20),waveMat);
 waves.rotation.x=-Math.PI/2;waves.position.set(reflector?0:0,reflector?.03:.02,0);g.add(waves);
 // 岸边湿沙与泡沫
 for(const z of [-4.5,4.5]){
  const foam=mesh(new T.BoxGeometry(39,.05,.5),material(night?'#8fa8a0':'#e6e2c8'),g,0,.02,z);
  foam.material.transparent=true;foam.material.opacity=.55;
 }
 // 荷叶与睡莲
 const pads=[[-11,-2.2,.9],[-3.5,2.6,1.05],[6.5,-3.1,.85],[13,1.8,.95],[-16,2.2,.8],[2,-3.4,.75],[10,-2.6,.7],[-7,3.3,.65]];
 for(const [x,z,r] of pads){
  const pad=new T.Mesh(new T.CircleGeometry(r,18),new T.MeshStandardMaterial({color:night?'#2f5a34':'#5f9a52',roughness:.8}));
  pad.rotation.x=-Math.PI/2;pad.position.set(x,.09,z);g.add(pad);
  if(Math.random()<.5)ball(g,x+(Math.random()-.5)*.4,.16,z+(Math.random()-.5)*.4,.12,'#e8b7c8',[1,.5,1]);
 }
 // 生态
 const kois=[koi(g,-9,0,'#d9663a',.2),koi(g,4,1.5,'#ece5d4',.55),koi(g,13,-1,'#c2452f',.85),koi(g,-16,-1.5,'#e0a54a',.35)];
 const frogs=[frog(g,-11,-2.2),frog(g,6.5,-3.1),frog(g,-3.5,2.6)];
 const schools=[tadpoles(g,-13,2.4,5),tadpoles(g,9,2.8,5)];
 const flies=[dragonfly(g,-6,3.2,.4),dragonfly(g,11,-3.4,.8)];
 const ripple=ripples(g,8);
 let slowFrames=0,frames=0;
 return {
  group:g,
  update(dt,t){
   waveUniforms.uTime.value=t*.001;
   // 自适应画质：平面反射要额外渲染整个场景，低端机/手机上代价高。
   // 连续掉帧就自动关掉倒影（本会话不再打开），保流畅优先。
   if(reflector){
    if(dt>.021)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);
    frames++;
    // 起步不反射（页面加载那几秒最卡），确认机器扛得住再开；扛不住就保持关闭。
    if(!reflector.visible&&frames>60&&slowFrames<12)reflector.visible=true;
    else if(reflector.visible&&frames>90&&slowFrames>45)reflector.visible=false;
   }
   for(const k of kois){
    const s=k.g.userData.koi;
    s.phase+=dt*s.speed*(1+Math.sin(t*.0004+s.phase*3)*.3);
    const nx=k.x+Math.cos(s.phase)*2.4,nz=k.z+Math.sin(s.phase*1.7)*1.8;
    k.g.position.set(nx,.12+Math.sin(t*.002+s.phase)*.03,nz);
    k.g.rotation.y=Math.atan2(-Math.sin(s.phase)*2.4*s.speed,Math.cos(s.phase*1.7)*1.8*s.speed)+Math.PI/2;
    k.g.children[3].rotation.z=Math.sin(t*.006+s.phase*2)*.25;   // 身子摆动
    if(Math.random()<dt*.05){ripple.spawn(nx,nz);}                 // 偶尔浮头
   }
   for(const f of frogs){
    if(!f.jumping){
     f.hopT-=dt;
     if(f.hopT<=0){
      f.jumping=true;f.jumpT=0;
      const a=Math.random()*Math.PI*2;
      f.to.x=Math.max(-17,Math.min(17,f.x+Math.cos(a)*3.2));
      f.to.z=Math.max(-3.8,Math.min(3.8,f.z+Math.sin(a)*3));
      ripple.spawn(f.x,f.z);
     }
    }else{
     f.jumpT+=dt*1.5;
     const u=Math.min(1,f.jumpT);
     f.g.position.x=f.x+(f.to.x-f.x)*u;
     f.g.position.z=f.z+(f.to.z-f.z)*u;
     f.g.position.y=f.homeY+Math.sin(u*Math.PI)*.85;
     f.g.rotation.z=Math.sin(u*Math.PI)*.3;
     if(u>=1){f.jumping=false;f.hopT=3+Math.random()*5;f.x=f.to.x;f.z=f.to.z;f.g.rotation.z=0;ripple.spawn(f.x,f.z);}
    }
   }
   for(const s of schools)for(const td of s.ones){
    td.a+=dt*td.speed*.4;
    td.t.position.x=Math.cos(td.a)*td.r+Math.sin(t*.001+td.a)*.3;
    td.t.position.z=Math.sin(td.a*1.3)*td.r*.8;
    td.t.rotation.y=td.a+Math.PI/2;
    td.t.children[1].rotation.z=Math.sin(t*.012+td.a*4)*.5;
   }
   for(const d of flies){
    d.phase+=dt*d.speed;
    d.g.position.set(d.x+Math.cos(d.phase)*4.5,1.5+Math.sin(t*.003+d.phase*2)*.35,d.z+Math.sin(d.phase*1.4)*2.2);
    d.g.rotation.y=-d.phase;
    if(Math.random()<dt*.35)ripple.spawn(d.g.position.x,d.g.position.z);
    d.g.children[2].rotation.z=Math.sin(t*.05+d.phase*6)*.4;
   }
   ripple.update(dt);
  },
 };
}
