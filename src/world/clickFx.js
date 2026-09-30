// 点击地面的聚焦反馈：涟漪圈 + 光点 + 火花。
// 鼠标点击与手指触摸走的是同一套 pointer 事件，所以桌面和手机共用这一个特效。
// 设计上保持「轻」：对象池复用 10 组，每组一个圈 + 一个光点 + 6 粒火花，0.6 秒内演完。
import * as T from 'three';

const RING=new T.RingGeometry(.4,.56,40);
const GLOW=new T.CircleGeometry(.2,24);
const SPARK=new T.TetrahedronGeometry(.07);

export function createClickFx(scene,{color='#f2d79b',spark='#ffe9b0',glow='#fff6dd'}={}){
 const pool=[];
 for(let i=0;i<10;i++){
  const g=new T.Group();
  const ring=new T.Mesh(RING,new T.MeshBasicMaterial({color,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;
  const dot=new T.Mesh(GLOW,new T.MeshBasicMaterial({color:glow,transparent:true,opacity:0,depthWrite:false}));
  dot.rotation.x=-Math.PI/2;
  g.add(ring,dot);
  const sparks=[];
  for(let s=0;s<6;s++){
   const sp=new T.Mesh(SPARK,new T.MeshBasicMaterial({color:spark,transparent:true,opacity:0,depthWrite:false}));
   const a=Math.PI*2*s/6+Math.random()*.5,r=.5+Math.random()*.25;
   sp.userData={vx:Math.cos(a)*r,vz:Math.sin(a)*r,vy:1+Math.random()*.6};
   g.add(sp);sparks.push(sp);
  }
  g.visible=false;g.renderOrder=3;
  scene.add(g);
  pool.push({g,ring,dot,sparks,life:0});
 }
 let cursor=0;
 return {
  // 在点击点放一朵反馈：地面/牌坊/门口/座席，任何「我点了这里」都该有回音。
  spawn(x,y,z){
   const slot=pool[cursor++%pool.length];
   slot.g.position.set(x,y,z);
   slot.g.visible=true;slot.life=0;
   slot.ring.material.opacity=.92;slot.ring.scale.setScalar(.5);
   slot.dot.material.opacity=.95;slot.dot.scale.setScalar(1);
   for(const sp of slot.sparks){sp.position.set(0,.04,0);sp.material.opacity=1;sp.scale.setScalar(1);sp.userData.vy=1+Math.random()*.6;}
  },
  update(dt){
   for(const slot of pool){
    if(!slot.g.visible)continue;
    slot.life+=dt;
    const t=slot.life/.6;
    if(t>=1){slot.g.visible=false;continue;}
    slot.ring.scale.setScalar(.5+t*1.8);
    slot.ring.material.opacity=.92*(1-t);
    slot.dot.material.opacity=Math.max(0,.95-t*4.5);
    slot.dot.scale.setScalar(1+t*.45);
    for(const sp of slot.sparks){
     sp.position.x+=sp.userData.vx*dt*1.5;
     sp.position.z+=sp.userData.vz*dt*1.5;
     sp.position.y=Math.max(0,sp.userData.vy*slot.life-4.2*slot.life*slot.life)+.04;
     sp.material.opacity=Math.max(0,1-t*1.15);
     sp.scale.setScalar(Math.max(.05,1-t));
    }
   }
  },
 };
}
