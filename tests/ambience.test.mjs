// 江湖氛围特效单测：花瓣回落、飞鸟盘旋、香烟上升、招幡波动、远山分层、扬尘池。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

// canvas 2d 桩（ambience 用 canvas 生成粒子纹理）
const pixels=new Uint8Array(64*64*4);
const noop=()=>{};
const ctxStub=()=>({fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',
 fillRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,ellipse:noop,bezierCurveTo:noop,quadraticCurveTo:noop,fill:noop,stroke:noop,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,clearRect:noop,
 createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:pixels}),putImageData:noop});
globalThis.document={createElement:()=>({width:64,height:64,getContext:ctxStub,addEventListener:noop})};

const {createPetals,createBirds,createSmoke,createFlags,createMountains,createDust}=await import('../src/world/ambience.js');

test('花瓣：会往下落，落到底部回到顶部继续（不堆在一处）',()=>{
 const scene=new T.Scene();
 const petals=createPetals(scene,{count:40,top:7});
 const geo=petals.points.geometry;
 const y0=geo.attributes.position.array[1];
 petals.update(.016,0);
 const y1=geo.attributes.position.array[1];
 assert.ok(y1<y0,'花瓣在飘落');
 // 推进很久以后仍然有粒子在空中（循环复用，不会掉光）
 for(let i=0;i<4000;i++)petals.update(.016,i*16);
 const ys=[...geo.attributes.position.array].filter((_,i)=>i%3===1);
 assert.ok(Math.max(...ys)<=7.2&&Math.min(...ys)>=-.1,'花瓣在有效高度内循环');
});
test('飞鸟：绕场盘旋且翅膀在拍',()=>{
 const scene=new T.Scene();
 const birds=createBirds(scene,{count:2});
 const wing0=birds.group.children[0].children[1];
 const start=wing0.rotation.z;
 birds.update(.016,1200);
 assert.ok(birds.group.children[0].position.length()>0,'鸟在动');
 assert.notEqual(wing0.rotation.z,start,'翅膀在拍打');
 birds.update(1,9000);
 assert.ok(Number.isFinite(birds.group.children[0].position.x),'长时间运行坐标有限');
});
test('香烟：缓缓上升并循环',()=>{
 const scene=new T.Scene();
 const smoke=createSmoke(scene,[{x:0,y:0,z:0}],{per:8});
 const geo=smoke.group.children[0].geometry;
 const y0=geo.attributes.position.array[1];
 smoke.update(.2,100);
 const y1=geo.attributes.position.array[1];
 assert.ok(y1>y0,'烟在上升');
 for(let i=0;i<200;i++)smoke.update(.05,i*50);
 const ys=[...geo.attributes.position.array].filter((_,i)=>i%3===1);
 assert.ok(Math.max(...ys)<=8*0.42+.001,'烟升到柱高后回到炉口');
});
test('招幡：旗面顶点在波动（有风）',()=>{
 const scene=new T.Scene();
 const flags=createFlags(scene,[{x:0,y:0,z:0,color:'#c85a4a',dir:1}]);
 const cloth=flags.group.children[1];
 const before=cloth.geometry.attributes.position.array.slice();
 flags.update(.016,500);
 const after=cloth.geometry.attributes.position.array;
 let moved=0;
 for(let i=0;i<after.length;i++)if(Math.abs(after[i]-before[i])>1e-6)moved++;
 assert.ok(moved>0,'旗面 z 在动（风吹）');
});
test('远山：三层剪影都在场景里',()=>{
 const scene=new T.Scene();
 const mountains=createMountains(scene,{grass:'#b9c8a3'});
 assert.equal(mountains.group.children.length,3,'三层山脊');
 assert.ok(mountains.group.children.every(l=>l.children.length>0),'每层都有山峰');
});
test('扬尘：出现 → 扩散 → 消失，池复用不泄漏',()=>{
 const scene=new T.Scene();
 const dust=createDust(scene,{pool:6});
 const before=dust.group.children.length;
 assert.equal(before,6,'预建 6 团尘土（对象池）');
 dust.spawn(1,2);
 assert.equal(dust.group.children.filter(c=>c.visible).length,1,'走路时脚下有尘土');
 dust.update(.2);
 assert.equal(dust.group.children.filter(c=>c.visible).length,1,'0.45 秒内还在');
 dust.update(.4);
 assert.equal(dust.group.children.filter(c=>c.visible).length,0,'演完消失');
 for(let i=0;i<50;i++){dust.spawn(i,0);dust.update(.02);}
 assert.equal(dust.group.children.length,before,'池复用，不新建对象');
});
