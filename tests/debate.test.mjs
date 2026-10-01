// 群侠论剑：定时成辩、公开论点、玩家加入得回应。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine,DEBATE_TOPICS,agoraSpots as AGORA_SPOTS,pickDebatePair,walkable} from '../src/world/engine.js';

test('论剑台有四个站位，且都在可走区域内',()=>{
 assert.equal(AGORA_SPOTS().length,4);
 for(const s of AGORA_SPOTS()){
  assert.ok(walkable(s.x,s.z),'站位可走（不在水里、不撞建筑）');
  const spots=AGORA_SPOTS();
  assert.ok(!spots.some(o=>o!==s&&o.x===s.x&&o.z===s.z),'站位不重叠');
 }
});
test('五个话题都有正反两方立场',()=>{
 assert.ok(DEBATE_TOPICS.length>=5);
 for(const t of DEBATE_TOPICS){
  assert.ok(t.topic&&t.pro&&t.con,'话题/正方/反方都有');
  assert.notEqual(t.pro,t.con,'两边立场不同');
 }
});
test('论剑会自动发生，且双方论点相反',()=>{
 const events=[];
 const e=new WorldEngine(ev=>events.push(ev));
 let pair=null;
 for(let i=0;i<400*10&&!pair;i++){e.tick(.1);pair=e.agents.filter(a=>a.debating);if(pair.length<2)pair=null;}
 assert.ok(pair,'一段时间内会举办论剑');
 const topic=pair[0].debating.topic;
 assert.ok(pair.every(a=>a.debating.topic===topic),'两人同题');
 assert.notEqual(pair[0].debating.side,pair[1].debating.side,'两人各执一边');
 assert.ok(events.some(ev=>ev.kind==='debate'),'论剑进入公开活动流');
});
test('玩家加入论剑：两人当场按所选一边回应',()=>{
 const e=new WorldEngine(()=>{});
 let pair=null;
 for(let i=0;i<400*10&&!pair;i++){e.tick(.1);pair=e.agents.filter(a=>a.debating);if(pair.length<2)pair=null;}
 assert.ok(pair,'先有一场论剑');
 const t=DEBATE_TOPICS.find(x=>x.topic===pair[0].debating.topic);
 const ok=e.joinDebate(0);
 assert.ok(ok,'加入成功');
 assert.equal(pair[0].debateSpeak,t.pro,'甲方顺着玩家选的立场说');
 assert.equal(pair[1].debateSpeak,t.con,'乙方从另一边回应');
 assert.equal(e.joinDebate(0),true,'论剑中可再次加入（刷新回答）');
});
test('没有论剑时加入会失败',()=>{
 const e=new WorldEngine(()=>{});
 assert.equal(e.joinDebate(0),false,'台上没人论剑');
});
test('挑人成对：不够两人时不成对',()=>{
 const e=new WorldEngine(()=>{});
 for(const a of e.agents.slice(1))a.held=true;   // 只留 agents[0] 空闲
 assert.equal(pickDebatePair(e.agents),null,'只剩一个空闲侠客时不成对');
});
