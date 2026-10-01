import * as T from 'three';
const mats=new Map();
// 程序化细节贴图：给纯色材质加上可感知的表面起伏（木纹/石材/草地/墙面/瓦片），
// 避免"塑料感"。canvas 生成一次后按颜色缓存，不增加外部资源。
const detailCache=new Map();
function noise(ctx,size,amount){
 const img=ctx.getImageData(0,0,size,size),d=img.data;
 for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*amount;d[i]=Math.max(0,Math.min(255,d[i]+n));d[i+1]=Math.max(0,Math.min(255,d[i+1]+n));d[i+2]=Math.max(0,Math.min(255,d[i+2]+n));}
 ctx.putImageData(img,0,0);
}
// kind: wood(木纹) | stone(石材) | grass(草地) | plaster(墙面) | tile(瓦片)
function detailTexture(color,kind){
 const key=color+':'+kind;if(detailCache.has(key))return detailCache.get(key);
 const S=128,c=document.createElement('canvas');c.width=S;c.height=S;const ctx=c.getContext('2d');
 ctx.fillStyle=color;ctx.fillRect(0,0,S,S);
 if(kind==='wood'){
  for(let i=0;i<26;i++){ctx.strokeStyle=`rgba(0,0,0,${.04+Math.random()*.05})`;ctx.lineWidth=1+Math.random()*1.6;ctx.beginPath();const y=Math.random()*S;ctx.moveTo(0,y);ctx.bezierCurveTo(S*.3,y+(Math.random()-.5)*6,S*.6,y+(Math.random()-.5)*6,S,y+(Math.random()-.5)*4);ctx.stroke();}
 }else if(kind==='stone'){
  for(let i=0;i<10;i++){ctx.fillStyle=`rgba(255,255,255,${.03+Math.random()*.04})`;const w=12+Math.random()*22,h=10+Math.random()*18;ctx.fillRect(Math.random()*(S-w),Math.random()*(S-h),w,h);}
  ctx.strokeStyle='rgba(0,0,0,.05)';for(let i=0;i<8;i++){ctx.beginPath();const y=Math.random()*S;ctx.moveTo(0,y);ctx.lineTo(S,y);ctx.stroke();}
 }else if(kind==='grass'){
  for(let i=0;i<260;i++){ctx.fillStyle=`rgba(${60+Math.random()*40|0},${90+Math.random()*50|0},${50+Math.random()*30|0},.28)`;const x=Math.random()*S,y=Math.random()*S;ctx.fillRect(x,y,1,2+Math.random()*3);}
 }else if(kind==='plaster'){
  for(let i=0;i<40;i++){ctx.fillStyle=`rgba(0,0,0,${.02+Math.random()*.03})`;ctx.fillRect(Math.random()*S,Math.random()*S,2+Math.random()*10,2+Math.random()*6);}
 }else if(kind==='tile'){
  ctx.strokeStyle='rgba(0,0,0,.12)';ctx.lineWidth=2;
  for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*S/8,0);ctx.lineTo(i*S/8,S);ctx.stroke();}
  for(let j=0;j<=4;j++){ctx.beginPath();ctx.moveTo(0,j*S/4);ctx.lineTo(S,j*S/4);ctx.stroke();}
 }
 noise(ctx,S,kind==='grass'?18:12);
 const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;
 detailCache.set(key,tex);return tex;
}
// 带表面细节的材质：color 为基色，kind 决定表面类型，rep 为贴图重复度。
function detailMaterial(color,kind='plaster',rep=1,roughness=.88){
 const tex=detailTexture(color,kind);tex.repeat.set(rep,rep);
 const key=`d:${color}:${kind}:${rep}:${roughness}`;
 if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color:0xffffff,map:tex,roughness}));
 return mats.get(key);
}
export function material(color,roughness=.85){const key=color+':'+roughness;if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,roughness}));return mats.get(key);}
export function mesh(geometry,color,parent,x=0,y=0,z=0){const m=new T.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
// 带表面细节的 mesh（用于地面、木材、石材、瓦面等大表面积构件）。
export function dmesh(geometry,color,kind,parent,x=0,y=0,z=0,rep=1,roughness=.88){
 const m=new T.Mesh(geometry,detailMaterial(color,kind,rep,roughness));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export const box=(p,x,y,z,w,h,d,c)=>mesh(new T.BoxGeometry(w,h,d),c,p,x,y,z);
export const ball=(p,x,y,z,r,c,s=[1,1,1])=>{const m=mesh(new T.SphereGeometry(r,12,10),c,p,x,y,z);m.scale.set(...s);return m;};
export const cylinder=(p,x,y,z,rt,rb,h,c,n=12)=>mesh(new T.CylinderGeometry(rt,rb,h,n),c,p,x,y,z);
export function textSign(parent,text,x,y,z,w=3,h=.7,bg='#eadfc2',fg='#324e46'){
 const c=document.createElement('canvas');c.width=768;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,768,192);ctx.strokeStyle=fg;ctx.lineWidth=4;ctx.strokeRect(12,12,744,168);ctx.fillStyle=fg;ctx.font='bold 86px "Songti SC", serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,103,720);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
 const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tex,roughness:.9}));m.position.set(x,y,z);parent.add(m);return m;
}
export function roof(parent,w,d,y,color,height=1.35){
 const n=12,verts=[],idx=[];
 for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
  const u=i/n*2-1,v=j/n*2-1,r=Math.max(Math.abs(u)*.77,Math.abs(v));
  const h=height*(1-r)+.3*Math.pow(Math.abs(u*v),3);
  verts.push(u*w/2,h,v*d/2);
 }
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i;idx.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const m=dmesh(g,color,'tile',parent,0,y,0,Math.max(2,Math.round(w/2)),.82);m.material.side=T.DoubleSide;m.castShadow=true;m.receiveShadow=true;parent.add(m);
 // Raised tile courses follow the curved slope, making the silhouette readable at distance.
 for(let x=-w/2+.15;x<w/2;x+=.32){const points=[];for(let j=0;j<=18;j++){const v=j/18*2-1,u=x/(w/2),r=Math.max(Math.abs(u)*.77,Math.abs(v));points.push(new T.Vector3(x,y+height*(1-r)+.3*Math.pow(Math.abs(u*v),3)+.04,v*d/2));}const tube=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),18,.025,3,false),material(color));parent.add(tube);}
 box(parent,0,y+height+.04,0,w*.6,.13,.15,'#a4b09b');
}
export function lantern(parent,x,y,z){cylinder(parent,x,y+.3,z,.035,.035,.35,'#6a5540',6);ball(parent,x,y,z,.22,'#dd9b56',[.8,1.3,.8]);cylinder(parent,x,y-.3,z,.045,.04,.25,'#b96945',6);}
export function building(p,color){
 const g=new T.Group();g.position.set(p.x,.05,p.z);g.userData={kind:'place',id:p.id};const w=p.w,d=p.d;
 dmesh(new T.BoxGeometry(w+.7,.4,d+.7),'#b7b8a7','stone',g,0,.2,0,Math.max(2,Math.round(w/2)));dmesh(new T.BoxGeometry(w+.25,.12,d+.25),'#e1d7bd','stone',g,0,.43,0,Math.max(2,Math.round(w/2)));
 if(p.kind==='pavilion'){
  for(const x of [-w/2+.3,w/2-.3])for(const z of [-d/2+.3,d/2-.3])dmesh(new T.CylinderGeometry(.13,.16,3.6,10),'#826247','wood',g,x,2.1,z,1,.82);
  roof(g,w+1.2,d+1.2,4.1,color);box(g,0,1,0,1.6,.14,1.6,'#976f4c');cylinder(g,0,.78,0,.16,.26,.55,'#765943');textSign(g,p.short,0,3.1,d/2+.3,2.6,.62);return g;
 }
 const h=p.kind==='hall'?5.2:p.kind==='library'?4.6:p.kind==='workshop'?4:3.6;
 dmesh(new T.BoxGeometry(w,h,d),'#eee2c5','plaster',g,0,h/2+.4,0,Math.max(2,Math.round(w/3)),.92);
 for(const x of [-w/2+.2,0,w/2-.2])dmesh(new T.CylinderGeometry(.09,.09,h,8),'#846345','wood',g,x,h/2+.4,d/2+.08,1,.8);
 for(const z of [-d/2+.2,d/2-.2])dmesh(new T.BoxGeometry(.14,h,.17),'#826448','wood',g,-w/2-.05,h/2+.4,z,1,.8);
 dmesh(new T.BoxGeometry(1.3,2.1,.08),'#354941','wood',g,0,1.15,d/2+.12,1,.7);
 dmesh(new T.BoxGeometry(.35,.5,.06),'#e6b978','wood',g,.42,1.2,d/2+.17,1,.7);
 for(const x of [-w*.32,w*.32]){
  const wy=p.kind==='library'?2.6:1.9;
  dmesh(new T.BoxGeometry(w*.2,1.5,.08),'#8a6b45','wood',g,x,wy,d/2+.09,1,.8);dmesh(new T.BoxGeometry(w*.17,1.3,.06),'#e6b978','wood',g,x,wy,d/2+.14,1,.8);
  for(let a=-1;a<=1;a++)box(g,x+a*w*.05,wy,d/2+.2,.035,1.3,.04,'#725c41');box(g,x,wy,d/2+.2,w*.2,.05,.04,'#725c41');
 }
 for(let a=0;a<4;a++)dmesh(new T.BoxGeometry(2.1+a*.25,.2,1.3-a*.18),'#ceccb8','stone',g,0,.1+a*.12,d/2+1.1-a*.26,1,.9);
 roof(g,w+1.1,d+1, h+.5,color,1.2);
 if(p.kind==='hall'||p.kind==='tea'||p.kind==='sect'){
  const w2=w*.68,d2=d*.62,g2=2.1;box(g,0,h+.7+.6+g2/2,0,w2,g2,d2,'#eee2c5');
  const ry=h+.7+.6+g2;
  for(let x=-w2/2+.3;x<w2/2;x+=.7){box(g,x,ry,d2/2+.05,.46,.78,.07,'#bda274');box(g,x,ry,d2/2+.12,.05,.82,.05,'#5d604c');}
  for(const sx of [-1,1]){box(g,sx*(w2/2+.06),ry-.05,0,.1,1.1,d2,'#8a6b45');box(g,sx*(w2/2+.06),ry+.5,d2/2-.3,1.2,.08,.08,'#a8783f');}
  roof(g,w2+1.5,d2+1.3,ry+.75,color,1.15);
 }
 textSign(g,p.short,0,2.9,d/2+.28,Math.min(w*.68,4.2),.7);
 if(p.kind==='library'){
  // 书院三层塔：逐层收分，每层檐角挂灯
  for(let t=0;t<2;t++){
   const w3=w*(.68-t*.16),d3=d*(.72-t*.14),y3=h+1.1+t*2.05;
   box(g,0,y3,0,w3,2,d3,'#eee2c5');
   roof(g,w3+1.1,d3+1.1,y3+1,color,.95);
   for(const sx of [-1,1]){ball(g,sx*(w3/2+.4),y3+1.2,0,.11,'#dd9b56',[.8,1.2,.8]);}
  }
 }
 if(p.kind==='sect'){
  // 门派旗幡：两杆高旗 + 旌旗布面，远处即可辨认为「门派」而非普通建筑。
  for(const sx of [-1,1]){cylinder(g,sx*(w/2+.55),2.7,d/2+.55,.045,.05,5,'#6d5943',8);box(g,sx*(w/2+.55),.15,d/2+.55,.34,.3,.34,'#a89a80');}
  box(g,-(w/2+1.2),3.4,d/2+.55,.9,2.1,.06,'#c85a4a');box(g,(w/2+1.2),3.4,d/2+.55,.9,2.1,.06,'#4a7a9e');
  ball(g,-(w/2+.55),5.3,d/2+.55,.13,'#d8b56a');ball(g,(w/2+.55),5.3,d/2+.55,.13,'#d8b56a');
  ball(g,-(w/2+.55),3.9,d/2+.55,.12,'#d8b56a');ball(g,(w/2+.55),3.9,d/2+.55,.12,'#d8b56a');
 }
 if(p.kind==='placeholder'){
  // Temporary shell: scaffolding and a blank board make the future replacement explicit.
  for(const x of [-w/2-.18,w/2+.18]){box(g,x,1.5,-d/2-.18,.12,2.9,.12,'#8d7858');box(g,x,1.5,d/2+.18,.12,2.9,.12,'#8d7858');}
  for(const y of [.35,1.45,2.55]){box(g,0,y,-d/2-.18,w+.55,.08,.08,'#b39461');box(g,0,y,d/2+.18,w+.55,.08,.08,'#b39461');}
  textSign(g,'功能待定',0,1.45,d/2+.24,2.25,.48,'#e9dfc4','#917448');
  box(g,0,1.1,-d/2-.2,1.3,1.2,.06,'#b8c6bf');
 }
 lantern(g,-w*.34,2.4,d/2+.65);lantern(g,w*.34,2.4,d/2+.65);
 if(p.kind==='workshop'){box(g,w/2+.5,1.25,0,1,1.4,1,'#ad9b7c');box(g,w/2+.5,2.1,0,.45,.6,.45,'#747f71');}
 return g;
}
export function tree(parent,x,z,size=1,flower=false){const g=new T.Group();g.position.set(x,0,z);parent.add(g);cylinder(g,0,1.1*size,0,.12*size,.21*size,2.2*size,'#8c7960',7);const colors=flower?['#e6b4ac','#efd0be','#dfa499']:['#819c79','#91ab83','#a6bc8d'];
 [[0,2.4,0,1.1],[-.65,2,.25,.9],[.6,2.2,.3,.85],[.1,2.2,-.6,.9]].forEach((a,i)=>{const m=mesh(new T.IcosahedronGeometry(a[3]*size,1),colors[i%3],g,a[0]*size,a[1]*size,a[2]*size);m.scale.y=.8;});return g;}
// 人物头部（脸盘 + 黑发 + 斗笠 + 五官）：主角色与门派内景的座席人物共用，
// 保证每一位原子侠都是同一张有眼睛、有微笑的脸。
export function figureHead(body,color='#427ab5',hat=true){
 ball(body,0,.96,.025,.43,'#fff9ed',[1.1,.96,.91]);
 ball(body,0,1.06,-.15,.42,'#393b3a',[1,1,.6]);
 ball(body,0,1,.10,.415,'#fff9ed',[1.1,.92,.8]);
 for(const x of [-.16,.16]){ball(body,x,1.04,.408,.066,'#292e2c',[.8,1.25,.4]);ball(body,x-.015,1.065,.432,.022,'#ffffff');ball(body,x*1.4,.92,.36,.078,'#eab0a0',[1,.66,.22]);}
 const smile=new T.Mesh(new T.TorusGeometry(.065,.012,4,12,Math.PI),material('#a17464'));smile.rotation.z=Math.PI;smile.position.set(0,.92,.431);body.add(smile);
 if(hat){cylinder(body,0,1.37,0,.11,.72,.28,'#363e3d',24);cylinder(body,0,1.23,0,.73,.73,.035,'#303938',24);ball(body,0,1.58,-.12,.16,'#363b3a');cylinder(body,0,1.51,-.12,.12,.13,.07,color);}
}
export function character(color='#b4432f',scale=1){
 const g=new T.Group(),body=new T.Group();g.add(body);g.scale.setScalar(scale);g.userData.body=body;
 const feet=[ball(body,-.16,.14,.04,.2,'#f3eee3',[.8,.7,1.1]),ball(body,.16,.14,.04,.2,'#f3eee3',[.8,.7,1.1])];
 cylinder(body,0,.47,0,.28,.39,.57,'#f5eee0');cylinder(body,0,.39,0,.36,.37,.1,color);
 figureHead(body,color);
 const collar1=box(body,-.1,.69,.275,.1,.35,.06,color);collar1.rotation.z=.65;const collar2=box(body,.08,.64,.29,.1,.42,.06,color);collar2.rotation.z=-.65;
 const arms=[ball(body,-.36,.55,0,.18,'#f3eee3',[.8,1.2,.8]),ball(body,.36,.55,0,.18,'#f3eee3',[.8,1.2,.8])];
 cylinder(body,-.37,.47,.02,.145,.145,.09,color);cylinder(body,.37,.47,.02,.145,.145,.09,color);
 const sword=new T.Group();sword.position.set(.34,.5,-.15);sword.rotation.z=-.5;box(sword,0,0,0,.1,.85,.09,'#66533f');box(sword,0,.3,0,.3,.06,.12,'#d7ae5f');cylinder(sword,0,.5,0,.07,.07,.1,'#d7ae5f');body.add(sword);
 g.userData.feet=feet;g.userData.arms=arms;return g;
}

// 垂柳：河岸武侠意象——树干 + 一圈垂落的柳条，远处一看就知道是水边。
export function willow(parent,x,z,size=1){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 cylinder(g,0,1.5*size,0,.16*size,.3*size,3*size,'#8a6b4a',8);
 for(let ring=0;ring<4;ring++){
  const a0=ring*1.2;
  for(let i=0;i<9;i++){
   const ang=a0+i*.7,r=1.25*size;
   const sx=Math.cos(ang)*r,sz=Math.sin(ang)*r,len=(1.1+Math.random()*.8)*size;
   const strand=box(g,sx,3*size-len/2+.1*size,sz,.055*size,len,.055*size,'#7fa05a');
   strand.rotation.z=(Math.random()-.5)*.22;strand.rotation.x=(Math.random()-.5)*.22;
  }
 }
 ball(g,0,3.1*size,0,.7*size,'#87a765',[1,.55,1]);
 return g;
}
// 水边芦苇/菖蒲：贴水一丛，补足水岸细节。
export function reeds(parent,x,z,n=7){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 for(let i=0;i<n;i++){
  const h=.9+Math.random()*.7,ang=Math.random()*Math.PI*2,r=Math.random()*.45;
  const blade=cylinder(g,Math.cos(ang)*r,h/2,Math.sin(ang)*r,.018,.03,h,'#8fa05c',5);
  blade.rotation.z=(Math.random()-.5)*.3;blade.rotation.x=(Math.random()-.5)*.3;
 }
 return g;
}
export function bridge(parent,x){
 const g=new T.Group();g.position.set(x,0,5);parent.add(g);
 for(let i=0;i<12;i++){const z=-2.3+i*.42,y=.18+Math.sin(i/11*Math.PI)*.55;box(g,0,y,z,2.3,.18,.47,'#c8c5af');for(const sx of [-1.1,1.1]){box(g,sx,y+.4,z,.12,.8,.12,'#a9b4a2');if(i<11)box(g,sx,y+.77,z+.21,.14,.12,.5,'#b7bba4');}}
}
export function atomSculpture(parent){const g=new T.Group();g.position.set(-1,0,-.5);parent.add(g);cylinder(g,0,.15,0,1.65,1.8,.3,'#bdc2aa',32);cylinder(g,0,.37,0,1.25,1.4,.15,'#e7dfc7',32);ball(g,0,1.7,0,.28,'#d1ae6b');
 for(let i=0;i<3;i++){const ring=new T.Mesh(new T.TorusGeometry(1.05,.035,6,64),material('#ba985c',.35));ring.position.y=1.7;ring.rotation.set(Math.PI/3,i*Math.PI/3,.3);g.add(ring);}
 return g;
}
