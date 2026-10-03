// 把雕刻好的 .blend 转成 GLB（本机没有 Blender CLI 时的替代路径）。
// 直接解析 blend 二进制：块链 → DNA 结构定义 → Mesh/MVert/MLoop/MPoly/Material → glTF 2.0。
//
// 用法：node scripts/blend-to-glb.mjs [输入.blend] [输出.glb]
//
// 已知边界（诚实说明）：
//   · 法线：MVert 不带法线（Blender 把它存在自定义数据层里），这里用三角形面法线累积生成光滑法线；
//   · 贴图：只取 Material.r/g/b 固有色，不导出贴图与 UV（单色雕刻件，影响有限）；
//   · 若模型带骨架/动画，此脚本不导——需要 Blender 导出 idle/walk 后另行接入。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const SRC=process.argv[2]||path.resolve(import.meta.dirname,'..','..','原子侠_标准模型_八视图精修版.blend');
const OUT=process.argv[3]||path.resolve(import.meta.dirname,'..','public','models','character-yuanzi.glb');

// ---------- 解压：.blend 是 zstd 多帧，node 单帧解压会截断，必须走 CLI ----------
async function loadBlend(file){
 const raw=fs.readFileSync(file);
 if(!(raw[0]===0x28&&raw[1]===0xb5&&raw[2]===0x2f&&raw[3]===0xfd))return raw;
 const tmp=file+'.plain';
 execFileSync('zstd',['-d','-f',file,'-o',tmp]);
 const out=fs.readFileSync(tmp);fs.unlinkSync(tmp);return out;
}

// ---------- 块链：头 32 字节 = code | SDNAnr | old(8) | len | 0 | count(8) ----------
function readBlocks(b){
 const blocks=[];let o=17;
 while(o+32<=b.length){
  const code=b.slice(o,o+4).toString('latin1').replace(/\0/g,'').trim();
  const sdna=b.readUInt32LE(o+4),old=Number(b.readBigUInt64LE(o+8)),len=b.readUInt32LE(o+16);
  blocks.push({code,sdna,old,len,off:o+32});
  if(code==='ENDB')break;
  o+=32+len;
 }
 return blocks;
}

// ---------- DNA ----------
function readDNA(b){
 const at=b.indexOf(Buffer.from('SDNANAME','latin1'));
 if(at<0)throw new Error('未找到 DNA 段');
 let p=at+8;
 const u32=()=>{const v=b.readUInt32LE(p);p+=4;return v;};
 const i16=()=>{const v=b.readInt16LE(p);p+=2;return v;};
 const strings=n=>{const s=p;const out=[];
  for(let i=0;i<n;i++){let x='';while(b[p]!==0)x+=String.fromCharCode(b[p++]);p++;out.push(x);}
  p+=(4-((p-s)%4))%4;return out;};
 const names=strings(u32());
 p+=4;const types=strings(u32());
 p+=4;const strcAt=b.indexOf(Buffer.from('STRC','latin1'),p);   // TLEN 没有计数字段，用 STRC 反推长度
 if(strcAt<0)throw new Error('未找到 TLEN/STRC 段');
 const nLen=(strcAt-p)>>1;
 const lens=[];for(let i=0;i<nLen;i++)lens.push(i16());
 p=strcAt+4;const nS=u32();
 const structs=[];
 for(let i=0;i<nS;i++){
  const ti=i16(),nf=i16();const fields=[];
  for(let k=0;k<nf;k++){const ft=i16(),fn=i16();
   fields.push({type:types[ft],name:names[fn],len:lens[ft]||0});}
  structs.push({name:types[ti],fields});
 }
 return {names,types,lens,structs};
}

// 结构布局：DNA 用显式 _pad 字段对齐，块内紧排（无隐式填充）
function layoutOf(dna,name){
 const i=dna.structs.findIndex(s=>s.name===name);
 if(i<0)throw new Error('DNA 缺少结构 '+name);
 let off=0;const def={};
 for(const f of dna.structs[i].fields){
  const arr=(f.name.match(/\[(\d+)\]/g)||[]).map(x=>+x.slice(1,-1));
  const cnt=arr.reduce((a,c)=>a*c,1);
  const ptr=f.name[0]==='*';
  def[f.name.replace(/\[\d+\]/g,'').replace(/\*/g,'')]={off,ptr,len:ptr?8:f.len,array:arr,cnt};
  off+=(ptr?8:f.len)*cnt;
 }
 return {index:i,size:off,def};
}

const num=(b,off,def,name)=>{
 const d=def[name];if(!d)return null;
 if(d.ptr)return Number(b.readBigUInt64LE(off+d.off));
 if(d.array.length){const out=[];for(let i=0;i<d.cnt;i++)out.push(b.readFloatLE(off+d.off+i*4));return out;}
 return b['readInt'+(d.len===2?'16':'32')+'LE'](off+d.off);
};
const cstr=(b,off)=>{let s='';for(let i=0;i<64;i++){const c=b[off+i];if(!c)break;s+=String.fromCharCode(c);}return s;};

// Blender(Z-up，面朝 -Y) → glTF(Y-up，面朝 +Z)

// 固色在着色器节点树里（Material.r/g/b 全空），改用部件名映射：命名本身就是美术给的语义。
const PART_COLORS=[[/douli|hat|cap|斗笠/i,'#c9b98f'],[/gold|金/i,'#d8a24a'],[/robe|hanfu|cloth|衣|袍/i,'#f2efe4'],
 [/collar|领/i,'#e8e4d8'],[/sash|带|binding|袖|sleeve/i,'#4a6f9e'],[/blue|蓝/i,'#4a6f9e'],[/bracer|grip|scabbard|sword|wood|柄|鞘|腕/i,'#8a6b45'],
 [/foot|shoe|靴|履/i,'#e8e4d8'],[/hair tie|发带/i,'#2f4f7a'],[/hair|发/i,'#2b2b2b'],[/eye|眼/i,'#f4f4f4'],
 [/cheek|腮|肤|skin/i,'#e8a89b'],[/mouth|嘴|唇/i,'#c8706a'],[/white|白/i,'#f0ece0'],[/brown|褐/i,'#8a6b45'],[/blush|red|朱/i,'#c85a4a']];
const partColor=name=>{for(const [re,c] of PART_COLORS)if(re.test(name))return c;return '#cfcabb';};
const toGltf=(x,y,z)=>[x,z,-y];
function faceNormal(p,i,j,k){
 const ax=p[j]-p[i],ay=p[j+1]-p[i+1],az=p[j+2]-p[i+2];
 const bx=p[k]-p[i],by=p[k+1]-p[i+1],bz=p[k+2]-p[i+2];
 let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
 const l=Math.hypot(nx,ny,nz)||1;
 return [nx/l,ny/l,nz/l];
}
function localMatrix(loc,rot,scl){
 const [sx,sy,sz]=[scl[0]||1,scl[1]||1,scl[2]||1];
 const rx=rot[0]||0,ry=rot[1]||0,rz=rot[2]||0;
 const mul=(A,B)=>A.map(r=>[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+r[k]*B[k][j],0)));
 const Rz=[[Math.cos(rz),-Math.sin(rz),0],[Math.sin(rz),Math.cos(rz),0],[0,0,1]];
 const Ry=[[Math.cos(ry),0,Math.sin(ry)],[0,1,0],[-Math.sin(ry),0,Math.cos(ry)]];
 const Rx=[[1,0,0],[0,Math.cos(rx),-Math.sin(rx)],[0,Math.sin(rx),Math.cos(rx)]];
 const R=mul(mul(Rz,Ry),Rx);
 const [x,y,z]=loc||[0,0,0];
 return [R[0][0]*sx,R[0][1]*sy,R[0][2]*sz,x,
         R[1][0]*sx,R[1][1]*sy,R[1][2]*sz,y,
         R[2][0]*sx,R[2][1]*sy,R[2][2]*sz,z];
}

// ---------- glTF 序列化 ----------
function buildGLB(groups,materials){
 let vTotal=0,iTotal=0;
 for(const g of groups){vTotal+=g.pos.length/3;iTotal+=g.idx.length;}
 const use16=vTotal<65536;
 const bin=Buffer.alloc(vTotal*24+iTotal*(use16?2:4)+1024);
 const views=[],accessors=[];
 const push=(data,stride,target)=>{
  let off=views.length?views[views.length-1].off+views[views.length-1].len:0;
  off+=(4-(off%4||4))%4;
  data.copy(bin,off);
  views.push({buffer:0,byteOffset:off,byteLength:data.length,byteStride:target===34962?undefined:undefined,target});
  return views.length-1;
 };
 const primitives=[];
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const g of groups)for(let i=0;i<g.pos.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],g.pos[i+k]);max[k]=Math.max(max[k],g.pos[i+k]);}
 const f32=arr=>{const b=Buffer.alloc(arr.length*4);for(let i=0;i<arr.length;i++)b.writeFloatLE(arr[i],i*4);return b;};
 let vOff=0;
 for(let gi=0;gi<groups.length;gi++){
  const g=groups[gi];
  const pv=f32(g.pos),nv=f32(g.nrm);
  const iBuf=use16?Buffer.alloc(g.idx.length*2):Buffer.alloc(g.idx.length*4);
  g.idx.forEach((v,i)=>use16?iBuf.writeUInt16LE(v+vOff,i*2):iBuf.writeUInt32LE(v+vOff,i*4));
  vOff+=g.pos.length/3;
  accessors.push({bufferView:push(pv,12,34962),componentType:5126,count:g.pos.length/3,type:'VEC3',min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]});
  accessors[accessors.length-1].min=min;accessors[accessors.length-1].max=max;
  accessors.push({bufferView:push(nv,12,34962),componentType:5126,count:g.nrm.length/3,type:'VEC3'});
  accessors.push({bufferView:push(iBuf,4,34963),componentType:use16?5123:5125,count:g.idx.length,type:'SCALAR'});
  primitives.push({attributes:{POSITION:accessors.length-3,NORMAL:accessors.length-2},indices:accessors.length-1,material:gi});
 }
 const json={
  asset:{version:'2.0',generator:'atom-jianghu/blend-to-glb'},
  scene:0,scenes:[{nodes:[0]}],
  nodes:[{mesh:0,name:'yuanzi'}],
  meshes:[{name:'yuanzi',primitives}],
  materials:materials.map(m=>({name:m.name,doubleSided:true,
   pbrMetallicRoughness:{baseColorFactor:[...(m.color||[.82,.82,.8]),1],metallicFactor:.05,roughnessFactor:.85}})),
  accessors,bufferViews:views,buffers:[{byteLength:bin.length}],
 };
 const jsonBuf=Buffer.from(JSON.stringify(json),'utf8');
 const jsonChunk=Buffer.concat([jsonBuf,Buffer.alloc((4-(jsonBuf.length%4||4))%4,0x20)]);
 const binChunk=Buffer.concat([bin,Buffer.alloc((4-(bin.length%4||4))%4,0)]);
 const total=12+8+jsonChunk.length+8+binChunk.length;
 const out=Buffer.alloc(total);
 let o=0;
 out.writeUInt32LE(0x46546c67,o);o+=4;
 out.writeUInt32LE(2,o);o+=4;
 out.writeUInt32LE(total,o);o+=4;
 out.writeUInt32LE(jsonChunk.length,o);o+=4;
 out.write('JSON',o,'latin1');o+=4;
 jsonChunk.copy(out,o);o+=jsonChunk.length;
 out.writeUInt32LE(binChunk.length,o);o+=4;
 out.write('BIN\0',o,'latin1');o+=4;
 binChunk.copy(out,o);
 return out;
}

// ---------- 主流程 ----------
const main=async()=>{
 if(!fs.existsSync(SRC)){console.error('找不到 .blend：'+SRC);process.exit(1);}
 const b=await loadBlend(SRC);
 if(b.slice(0,7).toString('latin1')!=='BLENDER'){console.error('不是 blend 文件');process.exit(1);}
 console.log('解压后 '+(b.length/1048576).toFixed(1)+'MB');

 const blocks=readBlocks(b);
 const dna=readDNA(b);
 console.log('块 '+blocks.length+' 个；DNA 结构 '+dna.structs.length+' 个、字段名 '+dna.names.length+' 个');

 const byOld=new Map();
 for(const bl of blocks)byOld.set(bl.old,bl);

 const L={obj:layoutOf(dna,'Object'),mesh:layoutOf(dna,'Mesh'),vert:layoutOf(dna,'MVert'),
  loop:layoutOf(dna,'MLoop'),poly:layoutOf(dna,'MPoly'),mat:layoutOf(dna,'Material'),id:layoutOf(dna,'ID'),attr:layoutOf(dna,'Attribute'),as:layoutOf(dna,'AttributeStorage')};

 // 材质固有色
 const materials=[];const matOf=new Map();
 for(const bl of blocks){
  if(bl.sdna!==L.mat.index)continue;
  const d=L.mat.def;
  materials.push({name:cstr(b,bl.off+L.id.def.name.off),
   r:b.readFloatLE(bl.off+d.r.off),g:b.readFloatLE(bl.off+d.g.off),b:b.readFloatLE(bl.off+d.b.off)});
  matOf.set(bl.old,materials.length-1);
 }
 if(!materials.length)materials.push({name:'default',r:.82,g:.82,b:.8});
 console.log('材质 '+materials.length+' 个');

 const groups=[];const groupFor=mat=>{
  let g=groups.find(x=>x.mat===mat);
  if(!g){g={mat,pos:[],nrm:[],idx:[]};groups.push(g);}
  return g;
 };
 let objects=0,skipped=0,totV=0,totF=0;
 // 属性名块：纯 ASCII 短字符串
 const nameOfBlk=x=>{
  if(x.sdna!==0||x.len===0||x.len>40)return null;
  const s=b.slice(x.off,x.off+x.len).toString('latin1').replace(/\0+$/,'');
  return [...s].every(c=>c>=' '&&c<='~')?s:null;
 };
 for(let bi=0;bi<blocks.length;bi++){
  const bl=blocks[bi];
  if(bl.sdna!==L.obj.index)continue;
  const o=bl.off;
  if(num(b,o,L.obj.def,'type')!==1)continue;                       // 只有网格对象
  objects++;
  const name=cstr(b,o+L.id.def.name.off);
  const meshBl=byOld.get(num(b,o,L.obj.def,'data'));
  if(!meshBl){skipped++;continue;}
  const dm=L.mesh.def;
  const totvert=num(b,meshBl.off,dm,'totvert'),totpoly=num(b,meshBl.off,dm,'totpoly'),totloop=num(b,meshBl.off,dm,'totloop');
  if(!totvert||!totpoly||!totloop){skipped++;console.log('  跳过 '+name+'（顶点/面/环为 0）');continue;}
  // Blender 4.1+ 的几何不走 mvert/mpoly/mloop 指针（都是 0），而是 Mesh 块之后紧跟的
  // [属性名][数据][描述符] 三元组 + 末尾的多边形环起点数组（totpoly+1 个 int）。
  const meshIdx=blocks.indexOf(meshBl);
  const attrs={};let k=meshIdx+1,kEnd=meshIdx+1;
  while(k<blocks.length){
   const x=blocks[k];
   if(x.sdna===L.obj.index||x.sdna===L.mesh.index||x.sdna===L.mat.index)break;   // 下一个 ID
   const nm=nameOfBlk(x);
   const desc=blocks[k+2];
   if(nm&&desc&&(desc.sdna===72||desc.sdna===73)){                  // 72=AttributeArray 73=AttributeSingle
    attrs[nm]={data:blocks[k+1],count:desc.sdna===72?Number(b.readBigInt64LE(desc.off+16)):1};
    k+=3;kEnd=k;continue;
   }
   k++;
  }
  const pos=attrs.position,cv=attrs['.corner_vert'];
  // 环起点：三元组之后的 (totpoly+1) 个 int 数组
  let offBlk=null;
  for(let j=kEnd;j<blocks.length;j++){
   const x=blocks[j];
   if(x.sdna===L.obj.index||x.sdna===L.mesh.index||x.sdna===L.mat.index)break;
   if(x.len===(totpoly+1)*4){offBlk=x;break;}
  }
  if(!pos||!cv||!offBlk){skipped++;console.log('  跳过 '+name+'（属性/环起点不齐：'+Object.keys(attrs).join(',')+'）');continue;}
  const M=localMatrix(num(b,o,L.obj.def,'loc'),num(b,o,L.obj.def,'rot'),num(b,o,L.obj.def,'size'));
  const verts=[];
  for(let i=0;i<totvert;i++){
   const x=b.readFloatLE(pos.data.off+i*12),y=b.readFloatLE(pos.data.off+i*12+4),z=b.readFloatLE(pos.data.off+i*12+8);
   verts.push(toGltf(M[0]*x+M[1]*y+M[2]*z+M[3],M[4]*x+M[5]*y+M[6]*z+M[7],M[8]*x+M[9]*y+M[10]*z+M[11]));
  }
  // 该对象的用色：Mesh.mat 数组里的第一个材质
  let color=null;
  const matArr=byOld.get(num(b,meshBl.off,dm,'mat'));
  if(matArr){
   const mb=byOld.get(Number(b.readBigUInt64LE(matArr.off)));
   if(mb&&mb.sdna===L.mat.index){
    const md=L.mat.def;
    color=[b.readFloatLE(mb.off+md.r.off),b.readFloatLE(mb.off+md.g.off),b.readFloatLE(mb.off+md.b.off)];
    if(color.every(v=>v===0))color=null;                           // 固色在节点树里，退回按部件名给色
   }
  }
  if(!color){const hex=partColor(name);color=[parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];}
  const colorKey=color.map(v=>Math.round(v*255)).join(',');
  // 体量过滤：背景板/镜头架之类远超角色尺度的物件不进导出
  let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
  for(const v of verts)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],v[a]);hi[a]=Math.max(hi[a],v[a]);}
  const span=Math.max(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]);
  if(span>6){skipped++;console.log('  跳过 '+name+'（体量 '+span.toFixed(1)+'m，超出角色尺度，疑似背景板/机身）');continue;}
  if(verts.some(a=>a.some(v=>!Number.isFinite(v)))){skipped++;console.log("  跳过 "+name+"（含非有限坐标）");continue;}
  const g=groupFor(colorKey);
  if(g.color===undefined)g.color=color;
  const base=g.pos.length/3;
  for(let i=0;i<totvert;i++)g.pos.push(verts[i][0],verts[i][1],verts[i][2]);
  for(let i=0;i<totpoly;i++){
   const s=b.readInt32LE(offBlk.off+i*4),e=i+1<totpoly?b.readInt32LE(offBlk.off+(i+1)*4):totloop;
   for(let t=1;t+1<e-s;t++){
    const a=base+b.readInt32LE(cv.data.off+s*4),b2=base+b.readInt32LE(cv.data.off+(s+t)*4),c=base+b.readInt32LE(cv.data.off+(s+t+1)*4);
    if(verts[a-base]===undefined||verts[b2-base]===undefined||verts[c-base]===undefined)continue;
    g.idx.push(a,b2,c);
    const n=faceNormal(g.pos,a*3,b2*3,c*3);
    g.nrm[a*3]+=n[0];g.nrm[a*3+1]+=n[1];g.nrm[a*3+2]+=n[2];
    g.nrm[b2*3]+=n[0];g.nrm[b2*3+1]+=n[1];g.nrm[b2*3+2]+=n[2];
    g.nrm[c*3]+=n[0];g.nrm[c*3+1]+=n[1];g.nrm[c*3+2]+=n[2];
   }
  }
  for(let i=0;i<g.nrm.length;i+=3){const l=Math.hypot(g.nrm[i],g.nrm[i+1],g.nrm[i+2])||1;g.nrm[i]/=l;g.nrm[i+1]/=l;g.nrm[i+2]/=l;}
  totV+=verts.length;totF+=totpoly;
 }
 console.log('网格对象 '+objects+' 个（'+skipped+' 个跳过）；累计顶点 '+totV+'、面 '+totF+'；材质分组 '+groups.length+' 组');
 if(!groups.length){console.error('没有读到任何网格');process.exit(1);}

 // 合并相邻同材质分组（减少 primitive）
 const merged=[];
 for(const g of groups){
  const last=merged[merged.length-1];
  if(last&&last.mat===g.mat){last.pos.push(...g.pos);last.nrm.push(...g.nrm);last.idx.push(...g.idx.map(v=>v+last.pos.length/3-g.pos.length/3));}
  else merged.push({mat:g.mat,pos:[...g.pos],nrm:[...g.nrm],idx:[...g.idx]});
 }

 // 规整：脚底 y=0，水平居中，再按身高归一到 1.7 米（Blender 场景单位不是米）
 let minY=Infinity,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const g of merged)for(let i=0;i<g.pos.length;i+=3){
  minY=Math.min(minY,g.pos[i+1]);minX=Math.min(minX,g.pos[i]);maxX=Math.max(maxX,g.pos[i]);
  minZ=Math.min(minZ,g.pos[i+2]);maxZ=Math.max(maxZ,g.pos[i+2]);
 }
 let height=0;for(const g of merged)for(let i=1;i<g.pos.length;i+=3)height=Math.max(height,g.pos[i]-minY);
 const scale=1.7/height,dx=(minX+maxX)/2,dz=(minZ+maxZ)/2;
 for(const g of merged)for(let i=0;i<g.pos.length;i+=3){
  g.pos[i]=(g.pos[i]-dx)*scale;g.pos[i+1]=(g.pos[i+1]-minY)*scale;g.pos[i+2]=(g.pos[i+2]-dz)*scale;
 }
 console.log('原始包围盒：高 '+height.toFixed(2)+'m，宽 '+(maxX-minX).toFixed(2)+'m，深 '+(maxZ-minZ).toFixed(2)+'m → 归一化到 1.7m（×'+scale.toFixed(3)+'）');

 // 抽稀：顶点网格聚类。雕刻件动辄几十万三角形，网页角色按 6 万三角形预算砍。
 const TARGET=60000;
 const dec=(pos,idx,cell)=>{
  const map=new Map(),remap=new Int32Array(pos.length/3),out=[];
  for(let i=0;i<pos.length;i+=3){
   const key=Math.round(pos[i]/cell)+','+Math.round(pos[i+1]/cell)+','+Math.round(pos[i+2]/cell);
   let id=map.get(key);
   if(id===undefined){id=out.length/3;map.set(key,id);out.push(pos[i],pos[i+1],pos[i+2]);}
   remap[i/3]=id;
  }
  const nidx=[];
  for(let i=0;i<idx.length;i+=3){
   const a=remap[idx[i]],b2=remap[idx[i+1]],c=remap[idx[i+2]];
   if(a===b2||b2===c||a===c)continue;
   nidx.push(a,b2,c);
  }
  return {pos:out,idx:nidx};
 };
 const rebuildNormals=g=>{
  g.nrm=new Array(g.pos.length).fill(0);
  for(let i=0;i<g.idx.length;i+=3){
   const a=g.idx[i]*3,b2=g.idx[i+1]*3,c=g.idx[i+2]*3;
   const n=faceNormal(g.pos,a,b2,c);
   for(const o of [a,b2,c]){g.nrm[o]+=n[0];g.nrm[o+1]+=n[1];g.nrm[o+2]+=n[2];}
  }
  for(let i=0;i<g.nrm.length;i+=3){const l=Math.hypot(g.nrm[i],g.nrm[i+1],g.nrm[i+2])||1;g.nrm[i]/=l;g.nrm[i+1]/=l;g.nrm[i+2]/=l;}
 };
 let before=0;for(const g of merged)before+=g.idx.length;
 let cell=.02;
 for(let t=0;t<10;t++){
  for(const g of merged){const r=dec(g.pos,g.idx,cell);g.pos=r.pos;g.idx=r.idx;rebuildNormals(g);}
  const now=merged.reduce((a,g)=>a+g.idx.length,0)/3;
  if(now>TARGET*1.15){cell*=1.35;}
  else if(now<TARGET*.75){cell/=1.2;}
  else break;
 }
 let after=0;for(const g of merged)after+=g.idx.length;
 console.log('抽稀：三角面 '+Math.round(before/3)+' → '+Math.round(after/3)+'（聚类格 '+cell.toFixed(4)+'m）');

 // 材质直接从分组颜色生成（blend 材质表只用来取固有色）
 const gMaterials=merged.map((g,i)=>({name:'part'+i,color:g.color||[.82,.82,.8]}));

 const glb=buildGLB(merged,gMaterials);
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,glb);
 console.log('已写出 '+OUT+'（'+(glb.length/1024).toFixed(0)+'KB）');
};

main().catch(e=>{console.error(e);process.exit(1);});
