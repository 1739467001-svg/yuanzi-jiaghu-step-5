// 河中桃花岛：位置、体量、不影响行走网格。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const pixels=new Uint8Array(64*64*4);
const noop=()=>{};
const ctxStub=()=>({fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',
 fillRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,ellipse:noop,bezierCurveTo:noop,quadraticCurveTo:noop,fill:noop,stroke:noop,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,clearRect:noop,setLineDash:noop,clip:noop,
 createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:pixels}),putImageData:noop,drawImage:noop});
globalThis.document={createElement:()=>({width:64,height:64,getContext:ctxStub,addEventListener:noop})};

const {peachIsland,zigzagBridge,riverPavilion,peachTree}=await import('../src/world/models.js');
const {walkable}=await import('../src/world/engine.js');

test('桃花岛在河心，且不影响行走网格',()=>{
 const parent=new T.Group();
 peachIsland(parent,2);
 assert.equal(parent.children[0].position.x,2);
 assert.equal(parent.children[0].position.z,5,'岛在河心（河在 z=5）');
 // 河水不可走：岛是远观的景，不该让寻路穿岛而过
 assert.equal(walkable(2,5),false,'河心仍不可走');
 assert.equal(walkable(2,7.5),true,'南岸照常可走');
});
test('桃花岛有足够细节（桃树/石琴台/石刻/岩石）',()=>{
 const parent=new T.Group();
 const island=peachIsland(parent,2);
 let meshes=0;island.traverse(o=>{if(o.isMesh)meshes++;});
 assert.ok(meshes>=25,'岛上有足够构件（当前 '+meshes+' 个）');
 // 石琴台与竹笛：岛中央应有高出水面的人造物
 let high=0;island.traverse(o=>{if(o.isMesh&&o.position.y>1)high++;});
 assert.ok(high>=3,'琴台/竹笛/石刻立在水面之上');
});
test('九曲桥是 Z 形多段，且不破坏桥的存在',()=>{
 const parent=new T.Group();
 const bridge=zigzagBridge(parent,2.4);
 let meshes=0;bridge.traverse(o=>{if(o.isMesh)meshes++;});
 assert.ok(meshes>=12,'Z 形桥至少三段桥面 + 栏杆（当前 '+meshes+' 个）');
});
test('观景亭在河岸可走处',()=>{
 const parent=new T.Group();
 const pav=riverPavilion(parent,4.5,10.5);
 assert.equal(pav.position.z,10.5);
 let meshes=0;pav.traverse(o=>{if(o.isMesh)meshes++;});
 assert.ok(meshes>=10,'亭子有四柱、台基、屋顶、栏杆');
});
test('桃树有粉白花冠与落瓣',()=>{
 const parent=new T.Group();
 const tree=peachTree(parent,0,0,1);
 let pink=0,petals=0;
 tree.traverse(o=>{
  if(!o.isMesh||!o.material)return;
  const c=o.material.color;if(!c)return;
  const hex='#'+c.getHexString();
  if(['#eaa9c0','#f2c3d2','#f6d3dd','#fbe4ea'].includes(hex))pink++;
  if(o.position.y<.15&&hex==='#f2c3d2')petals++;
 });
 assert.ok(pink>=4,'四团花冠');
 assert.ok(petals>=5,'树下有落瓣');
});
