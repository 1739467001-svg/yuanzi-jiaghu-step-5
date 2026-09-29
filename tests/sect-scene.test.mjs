// 门派 3D 场景单测（Node 里跑 three.js 几何层，不需要 WebGL）：
// 聚义阁的陈设是否到位、座席人物是否有脸、脸的朝向是否按位次不同、点击转身是否可用。
// textSign 用 canvas 画匾额，这里给一个最小 2D 上下文桩。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const noop=()=>{};
const ctxStub=()=>{
 const pixels=new Uint8Array(768*192*4);
 return {fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',
  fillRect:noop,strokeRect:noop,fillText:noop,strokeText:noop,measureText:()=>({width:10}),beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,arcTo:noop,bezierCurveTo:noop,quadraticCurveTo:noop,ellipse:noop,rect:noop,fill:noop,stroke:noop,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,clearRect:noop,setLineDash:noop,clip:noop,
  getImageData:()=>({data:pixels,width:768,height:192}),putImageData:noop,drawImage:noop};
};
globalThis.document={createElement:()=>({width:768,height:192,getContext:ctxStub,addEventListener:noop})};

const {buildSectsHall,buildSectInterior}=await import('../src/world/sectScene.js');
const sect={id:'s-1',name:'元气满满派',slogan:'一起把想法做出来',intro:'介绍',style:'startup',
 founderId:'u-1',founderName:'阿原',createdAt:1730000000000,
 elders:[{userId:'e-1',name:'青禾',title:'执法长老'},{userId:'e-2',name:'星河',title:'传功长老'}],
 disciples:[{userId:'d-1',name:'阿原',title:'大师兄'},{userId:'d-2',name:'小满',title:'二师姐'},{userId:'d-3',name:'朝露',title:'弟子'}]};

function sceneOf(fn){
 const parent=new T.Group();
 const interactive=[];
 const scene=fn(parent,interactive);
 return {parent,interactive,scene};
}
// 统计一个组下的网格数（粗略衡量"家徒四壁"与否）
const meshesOf=root=>{let n=0;root.traverse(o=>{if(o.isMesh)n++;});return n;};

test('聚义阁内景不再是家徒四壁：陈设、屏风、灯笼、红毡、兵器架都在',()=>{
 const {parent,scene}=sceneOf((p,i)=>buildSectInterior(p,{sect,palette:{roof:'#42746d',grass:'#b9c8a3',sky:'#dfe8d8'},night:false},i));
 const count=meshesOf(parent);
 assert.ok(count>=150,'内景网格数量足够（当前 '+count+'）');
 const plain=[],textured=[];
 parent.traverse(o=>{
  if(!o.isMesh||!o.material)return;
  if(o.material.map)textured.push(o);else if(o.material.color)plain.push('#'+o.material.color.getHexString());
 });
 assert.ok(textured.length>=15,'有纹理表面（墙面/木作/石作，当前 '+textured.length+'）');
 // 纯色构件：太师椅、灯笼、盆栽、兵器、茶具
 assert.ok(plain.includes('#7a3a2c'),'有椅背');
 assert.ok(plain.includes('#a8683f'),'有木作包边');
 assert.ok(plain.includes('#c8a24a'),'有鎏金线');
 assert.ok(plain.includes('#6d4f33'),'有椅腿');
 assert.ok(plain.includes('#e8b46a'),'有石灯/灯笼');
 assert.ok(plain.includes('#7fa06a'),'有盆栽');
 assert.ok(plain.includes('#8f8578'),'有兵器架');
 assert.ok(plain.includes('#f0ece0'),'有茶具');
 scene.dispose();
});
test('座席人物有脸：眼睛、微笑、斗笠都与主角色同一套',()=>{
 const {parent,interactive,scene}=sceneOf((p,i)=>buildSectInterior(p,{sect,palette:{},night:false},i));
 const seats=interactive.filter(o=>o.userData.kind==='sect-seat');
 assert.equal(seats.length,1+2+3,'创始人 + 2 长老 + 3 弟子都可点击');
 for(const seat of seats){
  const flat=[];let textured=0;
  seat.traverse(o=>{
   if(!o.isMesh||!o.material)return;
   if(o.material.map){textured++;return;}
   if(o.material.color)flat.push('#'+o.material.color.getHexString());
  });
  assert.ok(flat.filter(c=>c==='#292e2c').length>=2,seat.userData.name+' 有眼睛');
  assert.ok(flat.includes('#ffffff'),seat.userData.name+' 眼里有高光');
  assert.ok(flat.includes('#eab0a0'),seat.userData.name+' 有腮红');
  assert.ok(flat.includes('#a17464'),seat.userData.name+' 有微笑');
  assert.ok(flat.includes('#363e3d')&&flat.includes('#303938'),seat.userData.name+' 戴着斗笠');
  assert.ok(textured>=2,seat.userData.name+' 坐着带纹理的太师椅');
  assert.ok(flat.includes('#7a3a2c')||flat.includes('#8a5a2a'),seat.userData.name+' 椅背在位');
 }
 scene.dispose();
});
test('脸的朝向按位次而不同：创始人朝大殿、长老斜向、弟子朝主位',()=>{
 const {interactive,scene}=sceneOf((p,i)=>buildSectInterior(new T.Group(),{sect,palette:{},night:false},i));
 const byName=new Map(interactive.filter(o=>o.userData.kind==='sect-seat').map(s=>[s.userData.title+'·'+s.userData.name,s.rotation.y]));
 assert.ok(Math.abs(byName.get('门派创始人·阿原')??9)<1e-6,'创始人面向大殿（+z）');
 assert.ok(Math.abs(byName.get('执法长老·青禾')??0)>.3&&Math.abs(byName.get('执法长老·青禾'))<Math.PI/2,'长老斜向中前方');
 assert.ok(Math.abs((byName.get('传功长老·星河')??0)-Math.PI)>0.01,'左右长老朝向相反');
 assert.ok(Math.abs((byName.get('大师兄·阿原')??0)-Math.PI)<1e-6,'弟子面向主位（-z）');
 assert.ok(new Set([...byName.values()]).size>2,'同一场景里存在多种脸朝向');
 scene.dispose();
});
test('点击座席：少侠走过去，席上的人转身面向他',()=>{
 const {interactive,scene}=sceneOf((p,i)=>buildSectInterior(new T.Group(),{sect,palette:{},night:false},i));
 const seats=interactive.filter(o=>o.userData.kind==='sect-seat');
 const seat=seats[0];
 const before=seat.rotation.y;
 seat.userData.faceTo(3,0);   // 从右侧走近
 assert.ok(seat.userData.targetRot!==undefined,'记录目标朝向');
 assert.notEqual(seat.userData.targetRot,before,'目标朝向与初始不同');
 // 模拟渲染循环里的缓步转身
 let rot=seat.rotation.y;
 for(let i=0;i<60;i++)rot+=(seat.userData.targetRot-rot)*.2;
 assert.ok(Math.abs(rot-seat.userData.targetRot)<.02,'转身会收敛到目标朝向');
 // 从另一侧走近，目标朝向不同
 seat.userData.faceTo(-3,0);
 assert.notEqual(seat.userData.targetRot,rot,'不同位置走近，转向不同');
 scene.dispose();
});
test('HUD 点位与场景点位一一对应（点名字能走到同一座位）',()=>{
 const {interactive,scene}=sceneOf((p,i)=>buildSectInterior(new T.Group(),{sect,palette:{},night:false},i));
 const seats=interactive.filter(o=>o.userData.kind==='sect-seat').map(s=>({x:s.position.x,z:s.position.z,title:s.userData.title,name:s.userData.name}));
 const founder=seats.find(s=>s.title==='门派创始人');
 assert.deepEqual({x:founder.x,z:founder.z},{x:0,z:-8},'创始人在主位 (0,-8)——与 HUD goToSectSeat(0,-8) 一致');
 const disciple=seats.find(s=>s.title==='大师兄');
 assert.deepEqual({x:disciple.x,z:disciple.z},{x:-1.5*3.1,z:2},'大师兄在第一排左一 (col-1.5)*3.1, z=2');
 scene.dispose();
});
test('门派大殿：每页 4 座牌坊、翻页台、返回门',()=>{
 const {interactive,scene}=sceneOf((p,i)=>buildSectsHall(new T.Group(),{sects:sect?[sect]:[],page:1,pages:2,palette:{},night:false},i));
 assert.equal(interactive.filter(o=>o.userData.kind==='sect').length,1,'牌坊可点击');
 assert.equal(interactive.filter(o=>o.userData.kind==='sect-page').length,2,'左右翻页台');
 assert.equal(interactive.filter(o=>o.userData.kind==='sect-back').length,1,'返回小镇的门');
 assert.deepEqual(scene.banners.map(b=>b.id),['s-1'],'牌坊位次暴露给调用方挂名牌');
 scene.dispose();
});
