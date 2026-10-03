// 桃园结义：村口的桃花林 + 青石碑。玩家走近触发一次（对话/说明），并短暂加密飘瓣。
// 数据与呈现分离：场景在这里建好，触发回调交给上层（App 里的一次性引导卡）。
import * as T from 'three';
import {box,ball,cylinder,dmesh,mesh,material,textSign} from './models.js';

// 桃树：与普通树同构，但花冠是粉白，且树下有一圈落瓣。
export function peachTree(parent,x,z,size=1){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 cylinder(g,0,1.6*size,0,.17*size,.3*size,3.2*size,'#8a6b4a',8);
 // 三团花冠
 ball(g,0,3.9*size,.2*size,1.5*size,'#eaa9c0',[1,.9,1]);
 ball(g,.85*size,3.5*size,-.35*size,1.15*size,'#f2c3d2',[1,.95,1]);
 ball(g,-.8*size,3.65*size,.3*size,1.2*size,'#f6d3dd',[1,.9,1]);
 ball(g,.1*size,4.5*size,-.1*size,.95*size,'#fbe4ea',[1,.9,1]);
 // 树下落瓣
 for(let i=0;i<12;i++){
  const a=Math.random()*Math.PI*2,r=(.7+Math.random()*1.5)*size;
  ball(g,Math.cos(a)*r,.07,Math.sin(a)*r,.085*size,'#f2c3d2',[1,.35,1]);
 }
 return g;
}

// 结义碑：石台 + 石碑 + 一盏酒。
export function oathStele(parent,x,z){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 dmesh(new T.BoxGeometry(3.2,.5,2.2),'#b9b8a7','stone',g,0,.25,0,2,.9);
 dmesh(new T.BoxGeometry(1.5,3.2,.5),'#c9c8b7','stone',g,0,1.9,0,1,.92);
 dmesh(new T.BoxGeometry(1.9,.5,.7),'#a9a693','stone',g,0,3.7,0,2,.9);
 textSign(g,'桃 园 结 义',0,2.6,.28,2.6,.7,'#e8dcc0','#7a3a2a');
 box(g,0,.75,0,1.1,.9,.1,'#8a5a2a');                       // 案
 cylinder(g,-.3,1.05,.12,.08,.08,.22,'#e8dcc0',8);          // 酒碗
 cylinder(g,.3,1.05,.12,.08,.08,.22,'#e8dcc0',8);
 for(const sx of [-1,1]){cylinder(g,sx*.75,1.15,-.35,.09,.09,1.1,'#8f8578',6);ball(g,sx*.75,1.8,-.35,.14,'#dd9b56',[.8,1.2,.8]);}
 return g;
}

// 在村口（牌坊之后）布置一片桃林与结义碑，并返回走近触发。
export function createOathSpot(parent,{x=0,z=0,onEnter,night=false}={}){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 // 三株桃树围碑
 peachTree(g,-6.5,0,1.05);peachTree(g,6.5,0,1.1);peachTree(g,0,-3.2,1.25);
 // 满地落瓣（比树下的更广）
 for(let i=0;i<40;i++){
  const a=Math.random()*Math.PI*2,r=Math.random()*7;
  ball(g,Math.cos(a)*r,.06,Math.sin(a)*r*.8,.075,'#f2c3d2',[1,.35,1]);
 }
 oathStele(g,0,0);
 // 走近时扬起的一小阵落瓣：本地粒子，不做满村飘瓣那种环境噪音。
 const bn=26,bp=new Float32Array(bn*3),bg=new T.BufferGeometry();
 bg.setAttribute('position',new T.BufferAttribute(bp,3));
 const burst=new T.Points(bg,new T.PointsMaterial({color:'#f2c3d2',size:.17,transparent:true,opacity:0,depthWrite:false}));
 burst.visible=false;g.add(burst);
 let armed=true,cool=0,burstLeft=0,age=0;
 const arm=()=>{
  for(let i=0;i<bn;i++){
   const a=Math.random()*Math.PI*2,r=Math.random()*5.2;
   bp[i*3]=Math.cos(a)*r;bp[i*3+1]=2.4+Math.random()*2.4;bp[i*3+2]=Math.sin(a)*r*.8;
  }
  bg.attributes.position.needsUpdate=true;burst.visible=true;burst.material.opacity=.95;age=0;
 };
 return {
  group:g,
  // 每帧用玩家位置调用：走近 5 米内且距上次触发超过 8 秒，就再触发一次。
  update(dt,x,z){
   if(cool>0){cool-=dt;if(cool<=0)armed=true;}
   if(burstLeft>0){
    burstLeft-=dt;age+=dt;
    for(let i=0;i<bn;i++){
     bp[i*3+1]-=dt*(1.1+((i*7)%5)*.16);
     bp[i*3]+=Math.sin(age*2.2+i)*dt*.5;
    }
    bg.attributes.position.needsUpdate=true;
    burst.material.opacity=Math.max(0,.95*burstLeft/2.6);
    if(burstLeft<=0)burst.visible=false;
   }
   const near=Math.hypot(x-g.position.x,z-g.position.z)<5;
   if(near&&armed){armed=false;cool=8;burstLeft=2.6;arm();onEnter?.({x,z});}
  },
  get bursting(){return burstLeft>0;},
 };
}
