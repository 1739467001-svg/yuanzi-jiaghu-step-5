// 江湖氛围特效：花瓣飘落、飞鸟、香烟、招幡、远山、脚步扬尘。
// 全部程序化几何/粒子，无外部素材；按性能预算默认值都偏小，手机端由调用方再降一档。
import * as T from 'three';

// 一片柔和的花瓣（画布纹理，Points 用）
function petalTexture(color){
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
 const g=x.createRadialGradient(32,32,2,32,32,30);
 g.addColorStop(0,'#ffffffee');g.addColorStop(.55,color);g.addColorStop(1,'#ffffff00');
 x.fillStyle=g;x.beginPath();x.ellipse(32,32,26,17,.5,0,Math.PI*2);x.fill();
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
function softTexture(color='#ffffff'){
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
 const g=x.createRadialGradient(32,32,1,32,32,31);
 g.addColorStop(0,color);g.addColorStop(1,'#ffffff00');
 x.fillStyle=g;x.fillRect(0,0,64,64);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

// ---- 花瓣飘落：从树冠高度生成，随风斜落，着地前淡出 ----
export function createPetals(scene,{count=140,color='#f6c3d2',night=false,spread=17,top=7}={}){
 const tex=petalTexture(color);
 const pos=new Float32Array(count*3),seed=new Float32Array(count*2);
 for(let i=0;i<count;i++){
  pos[i*3]=(Math.random()*2-1)*spread;
  pos[i*3+1]=Math.random()*top;
  pos[i*3+2]=(Math.random()*2-1)*spread*.75;
  seed[i*2]=Math.random()*Math.PI*2;seed[i*2+1]=.5+Math.random()*.9;
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(pos,3));
 const mat=new T.PointsMaterial({size:night?.42:.5,map:tex,transparent:true,opacity:night?.55:.72,depthWrite:false,color:night?'#c9a8d8':'#ffffff'});
 const points=new T.Points(geo,mat);points.frustumCulled=false;scene.add(points);
 return {
   points,
   setBoost(on){mat.opacity=on?.55:(night?.42:.72);mat.size=on?.62:(night?.42:.5);},
  update(dt,t){
    const p=geo.attributes.position;
    for(let i=0;i<count;i++){
     const phase=seed[i*2],speed=seed[i*2+1];
     let y=p.array[i*3+1]-dt*speed*.55;
     let x=p.array[i*3]+Math.sin(t*.0008+phase)*dt*.9;
     let z=p.array[i*3+2]+Math.cos(t*.0006+phase*1.7)*dt*.5;
     if(y<0){y=top*Math.random();x=(Math.random()*2-1)*spread;z=(Math.random()*2-1)*spread*.75;}
     p.array[i*3]=x;p.array[i*3+1]=y;p.array[i*3+2]=z;
    }
    p.needsUpdate=true;
   },
  };
}

// ---- 飞鸟：绕场盘旋，翅膀用正弦拍打 ----
export function createBirds(scene,{count=3}={}){
 const group=new T.Group();scene.add(group);
 const birds=[];
 for(let i=0;i<count;i++){
  const b=new T.Group();
  const body=new T.Mesh(new T.SphereGeometry(.22,8,6),new T.MeshStandardMaterial({color:'#3b4440',roughness:.9}));
  body.scale.set(1,.7,1.6);b.add(body);
  const wings=[];
  for(const sx of [-1,1]){
   const w=new T.Mesh(new T.BoxGeometry(1.15,.06,.42),new T.MeshStandardMaterial({color:'#2f3a36',roughness:.95}));
   w.position.x=sx*.6;b.add(w);wings.push(w);
  }
  group.add(b);
  birds.push({b,wings,r:13+i*4.2,y:12+i*2.4,speed:.16+i*.045,phase:i*2.1,tilt:.12});
 }
 return {
   group,
   update(dt,t){
    for(const f of birds){
     f.phase+=dt*f.speed;
     f.b.position.set(Math.cos(f.phase)*f.r,f.y+Math.sin(t*.0007+f.phase)*.6,Math.sin(f.phase)*f.r*.7);
     f.b.rotation.y=-f.phase+Math.PI/2;
     f.b.rotation.z=Math.sin(f.phase)*.12;
     const flap=Math.sin(t*.011+f.phase*3)*.55;
     f.wings.forEach((w,i)=>w.rotation.z=(i?1:-1)*flap);
    }
   },
  };
}

// ---- 香烟（灶膛/香炉的青烟）：一团团上升、扩散、淡出 ----
export function createSmoke(scene,sources=[],{per=14,color='#e8e4d8',night=false}={}){
 const tex=softTexture(color);
 const group=new T.Group();scene.add(group);
 const all=[];
 for(const s of sources){
  const pos=new Float32Array(per*3);
  for(let i=0;i<per;i++){pos[i*3]=(Math.random()-.5)*.3;pos[i*3+1]=i*.42;pos[i*3+2]=(Math.random()-.5)*.3;}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));
  const mat=new T.PointsMaterial({size:1.15,map:tex,transparent:true,opacity:night?.16:.28,depthWrite:false});
  const p=new T.Points(geo,mat);p.frustumCulled=false;
  p.position.set(s.x,s.y,s.z);group.add(p);
  all.push({p,geo,per,seed:Math.random()*6});
 }
 return {
   group,
   update(dt,t){
    for(const s of all){
     const arr=s.geo.attributes.position.array;
     for(let i=0;i<s.per;i++){
      let y=arr[i*3+1]+dt*(.55+ (i%3)*.06);
      if(y>s.per*.42){y=0;arr[i*3]=(Math.random()-.5)*.3;arr[i*3+2]=(Math.random()-.5)*.3;}
      arr[i*3]+=Math.sin(t*.001+s.seed+i)*dt*.16;
      arr[i*3+1]=y;
     }
     s.geo.attributes.position.needsUpdate=true;
    }
   },
  };
}

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

// ---- 脚步扬尘：走路时在脚下弹几粒尘土 ----
export function createDust(scene,{pool=10}={}){
 const tex=softTexture('#d8cfae');
 const group=new T.Group();scene.add(group);
 const items=[];
 for(let i=0;i<pool;i++){
  const s=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,opacity:0,depthWrite:false}));
  s.scale.setScalar(.3);s.visible=false;group.add(s);items.push({s,life:0});
 }
 let cursor=0;
 return {
   group,
   spawn(x,z){
    const it=items[cursor++%pool];
    it.s.position.set(x+(Math.random()-.5)*.2,.12,z+(Math.random()-.5)*.2);
    it.s.visible=true;it.life=0;it.s.material.opacity=.42;
    it.s.scale.setScalar(.22);
   },
   update(dt){
    for(const it of items){
     if(!it.s.visible)continue;
     it.life+=dt;
     if(it.life>.45){it.s.visible=false;continue;}
     const t=it.life/.45;
     it.s.material.opacity=.42*(1-t);
     it.s.scale.setScalar(.22+t*.4);
     it.s.position.y+=dt*.35;
    }
   },
  };
}
