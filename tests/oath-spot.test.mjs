// 桃园结义与门派小镇预设的几何/触发单测（Node 里跑 three.js，无需 WebGL）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const pixels=new Uint8Array(64*64*4);
const noop=()=>{};
const ctxStub=()=>({fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',
 fillRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,ellipse:noop,bezierCurveTo:noop,quadraticCurveTo:noop,fill:noop,stroke:noop,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,clearRect:noop,setLineDash:noop,clip:noop,
 createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:pixels}),putImageData:noop,drawImage:noop});
globalThis.document={createElement:()=>({width:64,height:64,getContext:ctxStub,addEventListener:noop})};

const {createOathSpot}=await import('../src/world/oathSpot.js');

test('桃园结义布点：三株桃树 + 石碑，且坐标可用',()=>{
 const parent=new T.Group();
 const fired=[];
 const spot=createOathSpot(parent,{x:-7,z:9,onEnter:()=>fired.push(1)});
 assert.equal(spot.group.position.x,-7);
 assert.equal(spot.group.position.z,9);
 // 三株桃树（各若干网格）+ 石碑（若干网格）
 assert.ok(spot.group.children.length>=4,'桃树与石碑都在');
 let meshes=0;spot.group.traverse(o=>{if(o.isMesh)meshes++;});
 assert.ok(meshes>40,'桃林与碑有足够细节（当前 '+meshes+' 个网格）');
});
test('走近触发：5 米内触发一次，离开后有冷却',()=>{
 const parent=new T.Group();
 let hits=0;
 const spot=createOathSpot(parent,{x:0,z:0,onEnter:()=>hits++});
 // 远处不触发
 for(let i=0;i<60;i++)spot.update(.016,12,12);
 assert.equal(hits,0,'远处不触发');
 // 走近触发一次
 for(let i=0;i<60;i++)spot.update(.016,0,3);
 assert.equal(hits,1,'走近触发一次');
 // 停留不再刷屏（冷却 8 秒）
 for(let i=0;i<120;i++)spot.update(.016,0,3);
 assert.equal(hits,1,'停留不重复触发');
 // 走远再回来可再触发
 for(let i=0;i<700;i++)spot.update(.016,20,20);
 for(let i=0;i<60;i++)spot.update(.016,0,2);
 assert.equal(hits,2,'走远再走近会再触发');
});
test('走近时扬起一小阵落瓣，几秒后自己停',()=>{
 const parent=new T.Group();
 const spot=createOathSpot(parent,{x:0,z:0,onEnter(){}});
 assert.equal(spot.bursting,false,'平时不飘瓣');
 for(let i=0;i<60;i++)spot.update(.016,0,3);
 assert.equal(spot.bursting,true,'走近立刻扬瓣');
 for(let i=0;i<60*3;i++)spot.update(.016,0,3);
 assert.equal(spot.bursting,false,'2.6 秒后落瓣散尽');
});
test('门派小镇预设：五套地形的内景都能建出来',async()=>{
 const {buildSectInterior}=await import('../src/world/sectScene.js');
 const sect={id:'s1',name:'测试门派',slogan:'s',intro:'i',style:'startup',founderId:'u',founderName:'甲',elders:[{userId:'e',name:'青禾',title:'执法长老'}],disciples:[{userId:'d',name:'阿原',title:'大师兄'}]};
 const counts={};
 for(const terrain of ['village','lakeside','forest','mountain','float']){
  const parent=new T.Group();const interactive=[];
  buildSectInterior(parent,{sect:{...sect,townLayout:{terrain,theme:'cinnabar',buildings:['yishi','cangshu','wuchang'],elements:[{type:'flag',x:6,z:6},{type:'lantern',x:-6,z:-6}]}},palette:{},night:false},interactive);
  let meshes=0;parent.traverse(o=>{if(o.isMesh)meshes++;});
  counts[terrain]=meshes;
  assert.ok(meshes>150,terrain+' 地形网格足够（'+meshes+'）');
  assert.equal(interactive.filter(o=>o.userData.kind==='sect-seat').length,3,'三种角色座席都在');
 }
 // 五种地形的网格数应该互不相同（说明地形装饰真的生效）
 assert.equal(new Set(Object.values(counts)).size,5,'五种地形各有差异');
});
