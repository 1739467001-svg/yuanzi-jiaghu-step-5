import * as T from 'three';
const mats=new Map();
export function material(color,roughness=.85){const key=color+':'+roughness;if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,roughness}));return mats.get(key);}
export function mesh(geometry,color,parent,x=0,y=0,z=0){const m=new T.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
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
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const mat=new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.85});const m=new T.Mesh(g,mat);m.position.y=y;m.castShadow=true;m.receiveShadow=true;parent.add(m);
 // Raised tile courses follow the curved slope, making the silhouette readable at distance.
 for(let x=-w/2+.15;x<w/2;x+=.32){const points=[];for(let j=0;j<=18;j++){const v=j/18*2-1,u=x/(w/2),r=Math.max(Math.abs(u)*.77,Math.abs(v));points.push(new T.Vector3(x,y+height*(1-r)+.3*Math.pow(Math.abs(u*v),3)+.04,v*d/2));}const tube=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),18,.025,3,false),material(color));parent.add(tube);}
 box(parent,0,y+height+.04,0,w*.6,.13,.15,'#a4b09b');
}
export function lantern(parent,x,y,z){cylinder(parent,x,y+.3,z,.035,.035,.35,'#6a5540',6);ball(parent,x,y,z,.22,'#dd9b56',[.8,1.3,.8]);cylinder(parent,x,y-.3,z,.045,.04,.25,'#b96945',6);}
export function building(p,color){
 const g=new T.Group();g.position.set(p.x,.05,p.z);g.userData={kind:'place',id:p.id};const w=p.w,d=p.d;
 box(g,0,.2,0,w+.7,.4,d+.7,'#b7b8a7');box(g,0,.43,0,w+.25,.12,d+.25,'#e1d7bd');
 if(p.kind==='pavilion'){
  for(const x of [-w/2+.3,w/2-.3])for(const z of [-d/2+.3,d/2-.3])cylinder(g,x,1.6,z,.12,.14,2.5,'#826247');
  roof(g,w+1.1,d+1.1,2.9,color);box(g,0,.9,0,1.4,.13,1.4,'#976f4c');cylinder(g,0,.7,0,.15,.25,.5,'#765943');return g;
 }
 const h=p.kind==='hall'?2.6:2.3;
 box(g,0,h/2+.4,0,w,h,d,'#eee2c5');
 for(const x of [-w/2+.2,0,w/2-.2]){box(g,x,h/2+.4,d/2+.08,.16,h,.16,'#846345');}
 for(const z of [-d/2+.2,d/2-.2])box(g,-w/2-.05,h/2+.4,z,.14,h,.17,'#826448');
 box(g,0,.9,d/2+.12,1.15,1.45,.08,'#354941');
 for(const x of [-w*.32,w*.32]){
  box(g,x,1.6,d/2+.09,w*.2,1.35,.08,'#8a6b45');box(g,x,1.6,d/2+.14,w*.17,1.18,.06,'#e6b978');
  for(let a=-1;a<=1;a++)box(g,x+a*w*.05,1.6,d/2+.2,.035,1.18,.04,'#725c41');box(g,x,1.6,d/2+.2,w*.2,.05,.04,'#725c41');
 }
 for(let a=0;a<3;a++)box(g,0,.12+a*.1,d/2+.9-a*.25,1.9,.18,1.2-a*.15,'#ceccb8');
 roof(g,w+1.1,d+1, h+.5,color,1.2);
 if(p.kind==='hall'||p.kind==='tea'){
  const w2=w*.65,d2=d*.6;box(g,0,h+1.55,0,w2,1.35,d2,'#e8d6b5');
  for(let x=-w2/2+.3;x<w2/2;x+=.7){box(g,x,h+1.55,d2/2+.04,.46,.7,.07,'#bda274');box(g,x,h+1.55,d2/2+.1,.05,.75,.05,'#5d604c');}
  roof(g,w2+1.4,d2+1.2,h+2.3,color,1.1);
 }
 textSign(g,p.short,0,2.4,d/2+.25,Math.min(w*.6,3.6),.6);
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
export function character(color='#427ab5',scale=1){
 const g=new T.Group(),body=new T.Group();g.add(body);g.scale.setScalar(scale);g.userData.body=body;
 const feet=[ball(body,-.16,.14,.04,.2,'#f3eee3',[.8,.7,1.1]),ball(body,.16,.14,.04,.2,'#f3eee3',[.8,.7,1.1])];
 cylinder(body,0,.47,0,.28,.39,.57,'#f5eee0');cylinder(body,0,.39,0,.36,.37,.1,color);
 ball(body,0,.96,.025,.43,'#fff9ed',[1.1,.96,.91]);
 // Black hair and a wide, gently raised bamboo hat.
 ball(body,0,1.06,-.15,.42,'#393b3a',[1,1,.6]);
 ball(body,0,1,.10,.415,'#fff9ed',[1.1,.92,.8]);
 cylinder(body,0,1.37,0,.11,.72,.28,'#363e3d',24);cylinder(body,0,1.23,0,.73,.73,.035,'#303938',24);
 ball(body,0,1.58,-.12,.16,'#363b3a');cylinder(body,0,1.51,-.12,.12,.13,.07,color);
 for(const x of [-.16,.16]){ball(body,x,1.04,.408,.066,'#292e2c',[.8,1.25,.4]);ball(body,x-.015,1.065,.432,.022,'#ffffff');ball(body,x*1.4,.92,.36,.078,'#eab0a0',[1,.66,.22]);}
 const smile=new T.Mesh(new T.TorusGeometry(.065,.012,4,12,Math.PI),material('#a17464'));smile.rotation.z=Math.PI;smile.position.set(0,.92,.431);body.add(smile);
 const collar1=box(body,-.1,.69,.275,.1,.35,.06,color);collar1.rotation.z=.65;const collar2=box(body,.08,.64,.29,.1,.42,.06,color);collar2.rotation.z=-.65;
 const arms=[ball(body,-.36,.55,0,.18,'#f3eee3',[.8,1.2,.8]),ball(body,.36,.55,0,.18,'#f3eee3',[.8,1.2,.8])];
 cylinder(body,-.37,.47,.02,.145,.145,.09,color);cylinder(body,.37,.47,.02,.145,.145,.09,color);
 const sword=new T.Group();sword.position.set(.34,.5,-.15);sword.rotation.z=-.5;box(sword,0,0,0,.1,.85,.09,'#66533f');box(sword,0,.3,0,.3,.06,.12,'#d7ae5f');cylinder(sword,0,.5,0,.07,.07,.1,'#d7ae5f');body.add(sword);
 g.userData.feet=feet;g.userData.arms=arms;return g;
}
export function bridge(parent,x){
 const g=new T.Group();g.position.set(x,0,5);parent.add(g);
 for(let i=0;i<12;i++){const z=-2.3+i*.42,y=.18+Math.sin(i/11*Math.PI)*.55;box(g,0,y,z,2.3,.18,.47,'#c8c5af');for(const sx of [-1.1,1.1]){box(g,sx,y+.4,z,.12,.8,.12,'#a9b4a2');if(i<11)box(g,sx,y+.77,z+.21,.14,.12,.5,'#b7bba4');}}
}
export function atomSculpture(parent){const g=new T.Group();g.position.set(-1,0,-.5);parent.add(g);cylinder(g,0,.15,0,1.65,1.8,.3,'#bdc2aa',32);cylinder(g,0,.37,0,1.25,1.4,.15,'#e7dfc7',32);ball(g,0,1.7,0,.28,'#d1ae6b');
 for(let i=0;i<3;i++){const ring=new T.Mesh(new T.TorusGeometry(1.05,.035,6,64),material('#ba985c',.35));ring.position.y=1.7;ring.rotation.set(Math.PI/3,i*Math.PI/3,.3);g.add(ring);}
 return g;
}
