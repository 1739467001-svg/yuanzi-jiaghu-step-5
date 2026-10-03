// 江湖氛围特效：招幡（门派标识）、远山（水墨纵深）、微雨（稀有天气）。
// 只保留「有信息量」的几样——花瓣、飞鸟、香烟、扬尘这类纯装饰件糊画面，已移除。
// 全部程序化几何/粒子，无外部素材；按性能预算默认值都偏小，手机端由调用方再降一档。
import * as T from 'three';

// ---- 招幡/酒旗：旗面用网格顶点正弦波动，风感 ----
export function createFlags(scene,spots=[],{night=false}={}){
 const group=new T.Group();scene.add(group);
 const cloths=[];
 for(const s of spots){
  const pole=new T.Mesh(new T.CylinderGeometry(.07,.09,4.6,8),new T.MeshStandardMaterial({color:'#6d5943',roughness:.9}));
  pole.position.set(s.x,s.y+2.3,s.z);group.add(pole);
  const geo=new T.PlaneGeometry(1.35,1.9,4,5);
  const cloth=new T.Mesh(geo,new T.MeshStandardMaterial({color:s.color||'#c85a4a',side:T.DoubleSide,roughness:.85}));
  cloth.position.set(s.x+(s.dir||1)*.72,s.y+3.3,s.z);
  cloth.castShadow=true;group.add(cloth);
  cloths.push({cloth,base:geo.attributes.position.array.slice(),dir:s.dir||1});
 }
 return {
   group,
   update(dt,t){
    for(const c of cloths){
     const arr=c.cloth.geometry.attributes.position.array;
     for(let i=0;i<arr.length;i+=3){
      const x=c.base[i],y=c.base[i+1];
      arr[i+2]=Math.sin(t*.004+x*2.2+y*1.1)*.12*Math.min(1,Math.abs(x)*1.4+.2);
     }
     c.cloth.geometry.attributes.position.needsUpdate=true;
    }
   },
  };
}

// ---- 远山剪影：三层山脊压在雾里，给画面纵深 ----
export function createMountains(scene,palette,{night=false}={}){
 const group=new T.Group();scene.add(group);
 const layers=[{z:-78,scale:1.5,color:night?'#1d2c33':'#b9c6b4'},{z:-62,scale:1.15,color:night?'#243740':'##a9b8a6'},{z:-48,scale:.85,color:night?'#2c434c':'#9fb09d'}];
 for(const l of layers){
  const g=new T.Group();
  for(let i=0;i<7;i++){
   const h=(5+Math.abs(Math.sin(i*1.7))*9)*l.scale;
   const m=new T.Mesh(new T.ConeGeometry(6.5*l.scale,h,4),new T.MeshBasicMaterial({color:l.color}));
   m.position.set(-52+i*17+l.scale*3,h/2-3,l.z+(i%3)*2);
   m.rotation.y=Math.PI/4;g.add(m);
  }
  group.add(g);
 }
 return {group};
}

// ---- 群山环抱：门派院落外的一圈远山，用门派自己的主题色。
// 门派空间不挂小镇那座公共远山（进了门还看见村口的山不合逻辑），改用这一圈自家的山。
export function createRidge(scene,{far,near},{radius=68,count=26}={}){
 const group=new T.Group();scene.add(group);
 const layers=[{r:radius+16,scale:1.4,color:far,fog:false},{r:radius-6,scale:1,color:near}];
 for(const l of layers){
  const g=new T.Group();
  for(let i=0;i<count;i++){
   const a=(i/count)*Math.PI*2+l.scale*.37;
   const h=(6+Math.abs(Math.sin(i*2.3+l.scale*5))*14)*l.scale;
   const m=new T.Mesh(new T.ConeGeometry(9*l.scale,h,4),new T.MeshBasicMaterial({color:l.color,fog:l.fog||true}));
   const rr=l.r+Math.sin(i*1.7)*7;
   m.position.set(Math.cos(a)*rr,h/2-4,Math.sin(a)*rr);
   m.rotation.y=Math.PI/4;g.add(m);
  }
  group.add(g);
 }
 return {group};
}

// ---- 微雨（稀有天气事件，非常态）：斜落雨丝 + 脚下的水洼光斑 ----
export function createRain(scene,{count=520,night=false}={}){
 const group=new T.Group();group.visible=false;scene.add(group);
 const pos=new Float32Array(count*3),speed=new Float32Array(count);
 for(let i=0;i<count;i++){
  pos[i*3]=(Math.random()-.5)*54;pos[i*3+1]=Math.random()*22;pos[i*3+2]=(Math.random()-.5)*40;
  speed[i]=13+Math.random()*8;
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(pos,3));
 const mat=new T.PointsMaterial({color:night?'#a8c4d8':'#cfe0e8',size:.12,transparent:true,opacity:.55,depthWrite:false});
 const drops=new T.Points(geo,mat);drops.frustumCulled=false;group.add(drops);
 // 地面湿斑：贴着地面的一层柔光，雨停了就淡出
 const wet=new T.Mesh(new T.PlaneGeometry(46,36),new T.MeshBasicMaterial({color:night?'#20323c':'#7f9099',transparent:true,opacity:0,depthWrite:false}));
 wet.rotation.x=-Math.PI/2;wet.position.y=.06;group.add(wet);
 let fade=0;                                       // 0=停 1=正在下
 return {
  group,
  get raining(){return fade>.5;},
  start(){group.visible=true;fade=1;wet.material.opacity=.16;mat.opacity=.55;},
  stop(){fade=0;},
  update(dt){
   if(!group.visible)return;
   const p=geo.attributes.position;
   for(let i=0;i<count;i++){
    let y=p.array[i*3+1]-speed[i]*dt;
    let z=p.array[i*3+2]-dt*1.6;                 // 微微斜风
    if(y<0){y=22;z=(Math.random()-.5)*40;p.array[i*3]=(Math.random()-.5)*54;}
    p.array[i*3+1]=y;p.array[i*3+2]=z;
   }
   p.needsUpdate=true;
   if(fade>0&&wet.material.opacity<.16)wet.material.opacity=Math.min(.16,wet.material.opacity+dt*.2);
   if(fade===0){
    wet.material.opacity=Math.max(0,wet.material.opacity-dt*.12);
    mat.opacity=Math.max(0,mat.opacity-dt*.25);
    if(wet.material.opacity<=0&&mat.opacity<=0)group.visible=false;
   }
  },
 };
}
