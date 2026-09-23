import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine,findPath,walkable,hallWalkable} from '../src/world/engine.js';
import {PLACES} from '../src/world/config.js';
import {demoReply,retrieve,allWorks} from '../server/chat.mjs';
import {memoryFor} from '../src/storage.js';

test('every building entrance can be reached without crossing walls or the river',()=>{
 for(const p of PLACES){const route=findPath([-3,1],p.entry);assert.ok(route.length,p.id);assert.deepEqual(route.at(-1),p.entry);for(let i=0;i<route.length;i++){assert.ok(walkable(...route[i]));if(i)assert.equal(Math.abs(route[i][0]-route[i-1][0])+Math.abs(route[i][1]-route[i-1][1]),1);}}
});
test('cross-river travel uses a bridge and cannot walk on water',()=>{const route=findPath([0,0],[0,10]);assert.ok(route.some(p=>p[1]===5));for(const [x,z] of route)if(z===5)assert.ok(x>=-5&&x<=-3||x>=9&&x<=11);});
test('indoor paths avoid all eight exhibit stands',()=>{const path=findPath([0,8],[0,-7],hallWalkable);assert.ok(path.length);assert.deepEqual(path.at(-1),[0,-7]);assert.ok(path.every(p=>hallWalkable(...p)));});
test('a full hour of local simulation remains finite and produces social memories',()=>{let count=0;const engine=new WorldEngine(()=>count++);for(let i=0;i<36000;i++)engine.tick(.1);assert.ok(count>20);assert.ok(engine.agents.some(a=>a.memory.length));for(const a of engine.agents){assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.z));assert.ok(a.memory.length<=20);assert.ok(a.path.every(p=>walkable(...p)));}});
test('private chat interrupts public activity and stays held until release',()=>{const e=new WorldEngine();e.hold('ayuan');const a=e.agents[0],x=a.x,z=a.z;for(let i=0;i<1000;i++)e.tick(.1);assert.equal(a.x,x);assert.equal(a.z,z);assert.equal(a.state,'与你交谈');assert.equal(a.partner,null);e.release(a.id);for(let i=0;i<200;i++)e.tick(.1);assert.equal(a.held,false);assert.notEqual(a.state,'与你交谈');});
test('content IDs and references remain isolated across competitions',()=>{assert.equal(allWorks.length,56);assert.equal(new Set(allWorks.map(w=>w.id)).size,56);assert.equal(allWorks.filter(w=>w.editionId==='funskills').length,38);for(const w of allWorks){assert.ok(w.id.startsWith(w.editionId+'--'));assert.equal(w.wechat,undefined);assert.equal(w.qr,undefined);}});
test('guide retrieves real exhibits and does not invent awards',()=>{const works=retrieve('推荐效率工具作品');assert.ok(works.length);assert.ok(works.every(w=>allWorks.some(real=>real.id===w.id)));const reply=demoReply({message:'谁是冠军',agentId:'ayuan'});assert.match(reply.text,/没有收录/);assert.equal(reply.mode,'demo');});
test('private memories are selected by exact agent identity and absent memories are not invented',()=>{const memories=[{agentId:'ayuan',text:'我喜欢写作'},{agentId:'moyu',text:'我喜欢编程'}];assert.deepEqual(memoryFor(memories,'ayuan'),[memories[0]]);const reply=demoReply({message:'你记得我吗',agentId:'ayuan',memories:[]});assert.match(reply.text,/还没有/);assert.equal(memoryFor([], 'ayuan').length,0);});

test('AI Town coordinates round trip without leaking private world fields',async()=>{const {townToScene,sceneToTown,publicActorSnapshot}=await import('../src/world/aiTownAdapter.js');const point={x:14,y:32},transform={originX:10,originY:20,scale:2};assert.deepEqual(sceneToTown(townToScene(point,transform),transform),point);const [actor]=publicActorSnapshot({players:[{id:'p:0',position:point,facing:{dx:1,dy:0},speed:1,human:'user'}],conversations:[{secret:'private'}],memories:[{secret:'private'}]},[{playerId:'p:0',name:'侠客'}],transform);assert.equal(actor.controller,'human');assert.equal(actor.angle,Math.PI/2);assert.equal(actor.name,'侠客');assert.equal(actor.conversations,undefined);assert.equal(actor.memories,undefined);assert.throws(()=>townToScene({x:NaN,y:0}));});

test('actors stand on the arch of the bridge rather than inside it',async()=>{const {terrainHeight}=await import('../src/world/engine.js');assert.ok(terrainHeight(-4,5)>.8);assert.ok(terrainHeight(10,5)>.8);assert.equal(terrainHeight(0,0),0);assert.equal(terrainHeight(0,5),0);});

test('agents observe published works and form sourced impressions without inventing awards',()=>{
 const gated=new WorldEngine(()=>{});
 gated.setWorks([{id:'funskills--x',title:'未发布作品',publicationStatus:'待审核'}]);
 assert.equal(gated.works.length,0,'未发布作品不进入观展目标');
 const engine=new WorldEngine(()=>{});
 engine.setWorks(allWorks);
 for(let i=0;i<36000;i++)engine.tick(.1);
 const viewed=engine.agents.flatMap(a=>a.views);
 assert.ok(viewed.length>=8,'长时间模拟应产生多次观展');
 for(const v of viewed){
  assert.ok(v.impression.length<=60);
  assert.match(v.impression,/《.+》/);
  assert.ok(allWorks.some(w=>w.id===v.workId&&w.title===v.title),'观感必须对应真实已发布作品');
  assert.ok(!/奖|冠军|第一名|金奖|获奖/.test(v.impression),'观感不得生成奖项或名次');
 }
 for(const a of engine.agents)assert.equal(a.viewed.size,new Set([...a.viewed]).size,'同一角色不重复生成同一作品观感');
 const observer=engine.agents.find(a=>a.views.length);
 assert.ok(observer.state.length>0);
});
test('guide brings up the agent’s own exhibit visit and stays silent when there is none',()=>{
 const seen=[{workId:'funskills--ecom-video',title:'电商视频全能版',tagline:'把视频流水线装进桌面',impression:'《电商视频全能版》：“把视频流水线装进桌面”。从原型做起很务实。',opinion:'从原型做起很务实'}];
 const reply=demoReply({message:'你今天在馆里看了什么？',agentId:'xingzhou',observations:seen});
 assert.match(reply.text,/电商视频全能版/);
 assert.deepEqual(reply.workIds,['funskills--ecom-video']);
 assert.match(reply.text,/看法是我自己的/);
 const none=demoReply({message:'你今天看了什么',agentId:'xingzhou',observations:[]});
 assert.match(none.text,/还没顾上去馆里/);
 assert.deepEqual(none.workIds,[]);
});
