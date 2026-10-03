// 程序化骨架与动画：按 glTF 2.0 皮肤规范给已抽稀的网格生成蒙皮数据与 idle/walk 动画。
// 不依赖 Blender——角色的关节用身高分段定义，权重按「部件类型 + 身高分段」双通道分配。
// 汉服下摆遮腿，所以行走动画主要体现在：下摆摆动、躯干起伏、袖臂反摆（对长袍角色这已经像走路）。

const JOINTS=[
 {id:'hips',       parent:null,  t:[0,0.80,0],  side:0},
 {id:'spine',      parent:'hips', t:[0,0.10,0],  side:0},
 {id:'chest',      parent:'spine',t:[0,0.16,0],  side:0},
 {id:'neck',       parent:'chest',t:[0,0.16,0],  side:0},
 {id:'head',       parent:'neck', t:[0,0.09,0],  side:0},
 {id:'shoulder.L', parent:'chest',t:[0.14,0.10,0],side:-1},
 {id:'forearm.L',  parent:'shoulder.L',t:[0.16,0,0],side:-1},
 {id:'hand.L',     parent:'forearm.L',t:[0.15,-0.02,0],side:-1},
 {id:'shoulder.R', parent:'chest',t:[-0.14,0.10,0],side:1},
 {id:'forearm.R',  parent:'shoulder.R',t:[-0.16,0,0],side:1},
 {id:'hand.R',     parent:'forearm.R',t:[-0.15,-0.02,0],side:1},
 {id:'thigh.L',    parent:'hips', t:[0.10,-0.04,0],side:-1},
 {id:'shin.L',     parent:'thigh.L',t:[0,-0.34,0],side:-1},
 {id:'foot.L',     parent:'shin.L',t:[0,-0.32,0],side:-1},
 {id:'thigh.R',    parent:'hips', t:[-0.10,-0.04,0],side:1},
 {id:'shin.R',     parent:'thigh.R',t:[0,-0.34,0],side:1},
 {id:'foot.R',     parent:'shin.R',t:[0,-0.32,0],side:1},
];

// 部件 → 主导关节（按对象名匹配；默认走身高分段）
const PART_JOINT=[
 [/head|face|头|脸|neck|脖/i,['head','neck']],
 [/hair|发/i,['head']],
 [/hat|douli|斗笠/i,['head']],
 [/eye|眼/i,['head']],
 [/cheek|腮|肤|skin|mouth|嘴|唇/i,['head']],
 [/hand|袖|sleeve|cuff|绑手|bracer|腕/i,['forearm','hand']],
 [/sash|带|belt|腰/i,['spine','hips']],
 [/collar|领/i,['chest']],
 [/robe|袍|hanfu|cloth|衣/i,null],          // null = 走身高分段
];

// 三维四元数乘法（q = a*b）
const qmul=(a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
// 绕 Z / X / Y 轴旋转的四元数（弧度）
const qz=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
const qx=a=>[Math.sin(a/2),0,0,Math.cos(a/2)];
const qy=a=>[0,Math.sin(a/2),0,Math.cos(a/2)];

// 由父关节的世界变换推出每个关节的 rest 世界矩阵
function mat4Of(joints){
 const byId={};for(const j of joints)byId[j.id]=j;
 const world=[];
 for(const j of joints){
  const p=j.parent?world[joints.indexOf(byId[j.parent])]:null;
  world.push(p?mul4(p,j.m):j.m);
 }
 return world;
}
const mul4=(a,b)=>{
 const o=new Array(16).fill(0);
 for(let i=0;i<4;i++)for(let k=0;k<4;k++){const v=a[i*4+k];if(!v)continue;for(let j=0;j<4;j++)o[i*4+j]+=v*b[k*4+j];}
 return o;
};
const m4=(tx,ty,tz,q)=>{
 const [x,y,z,w]=q;
 const x2=x+x,y2=y+y,z2=z+z;
 const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
 return [1-(yy+zz),xy-wz,xz+wy,0, xy+wz,1-(xx+zz),yz-wx,0, xz-wy,yz+wx,1-(xx+yy),0, tx,ty,tz,1];
};
// 4x4 矩阵求逆（行主序，余子式伴随矩阵）
function invert4(m){
 const minor=(r,c)=>{
  const rows=[0,1,2,3].filter(i=>i!==r),cols=[0,1,2,3].filter(j=>j!==c);
  const a=rows.map(i=>cols.map(j=>m[i*4+j]));
  return a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1])
       -a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0])
       +a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
 };
 let det=0;for(let c=0;c<4;c++)det+=((c%2)?-1:1)*m[c]*minor(0,c);
 if(!det)return null;
 const out=new Array(16);
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)out[j*4+i]=(((i+j)%2)?-1:1)*minor(i,j)/det;
 return out;
}

export {JOINTS,PART_JOINT,m4,mul4,invert4,mat4Of,qmul,qx,qy,qz};
