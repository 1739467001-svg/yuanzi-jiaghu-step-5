import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorld} from '../server/world.mjs';

// 账号、发布状态等本地存储写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-world-'));
process.env.ATOM_DATA_DIR=tmp;
const {register,login} = await import('../server/accounts.mjs');

class MockSocket{
 constructor(){this.sent=[];this.closed=null;this.handlers={};}
 send(data){this.sent.push(JSON.parse(data));}
 close(code,reason){this.closed={code,reason};this.handlers.close?.();}
 on(event,fn){this.handlers[event]=fn;}
 emit(event,data){this.handlers[event]?.(data);}
 say(message){this.emit('message',JSON.stringify(message));}
 last(){return this.sent.at(-1);}
 find(t){return this.sent.filter(m=>m.t===t);}
}
// 每个测试账号独立注册；hello 只携带会话令牌，身份由服务端解析。
function accountFor(label){try{register(label,'password123','#427ab5');}catch{}return login(label,'password123');}
function join(world,label){
 const ws=new MockSocket();
 world.connect(ws);
 const session=accountFor(label);
 ws.say({t:'hello',token:session.token});
 ws.session=session;
 return ws;
}
const move=(ws,x,z)=>ws.say({t:'move',x,z,id:'mv-'+Math.random()});

test('hello without a valid token is rejected and identity cannot be spoofed', () => {
 const world=createWorld();
 const stranger=new MockSocket();
 world.connect(stranger);
 stranger.say({t:'hello',token:'bogus-token'});
 assert.equal(stranger.last().t,'auth-required');
 assert.equal(stranger.closed.code,4003);
 // 客户端传入他人的 userId 与名字一律忽略：身份只来自服务端会话。
 const victim=accountFor('受害者');
 const attacker=new MockSocket();
 world.connect(attacker);
 attacker.say({t:'hello',token:victim.token,userId:'someone-else',name:'骗子'});
 const welcome=attacker.find('welcome')[0];
 assert.equal(welcome.you.id,victim.user.id,'角色 ID 来自服务端会话');
 assert.equal(welcome.you.name,'受害者','名字来自账号名帖');
});

test('two accounts join, see each other, and the server owns their positions', () => {
 const world=createWorld();
 const a=join(world,'联机甲'),b=join(world,'联机乙');
 assert.equal(a.find('welcome').length,1);
 assert.equal(a.find('welcome')[0].you.id,a.session.user.id);
 assert.ok(a.find('snapshot').length>=1,'加入后广播快照');
 const snap=b.last();
 assert.ok(snap.actors.some(x=>x.id===a.session.user.id&&x.name==='联机甲'),'双方在彼此快照里');
 // 快照只含公开字段。
 for(const actor of snap.actors)for(const field of ['chatWith','blocked','path','moveStamps','lastSeen'])assert.equal(actor[field],undefined,`快照不得包含 ${field}`);
 // 服务端接受移动并推进位置。
 const before=world.actors.get(a.session.user.id).x;
 move(a,10,-6);
 assert.equal(a.last().t,'move-ok');
 for(let i=0;i<200;i++)world.tick(.1);
 assert.notEqual(world.actors.get(a.session.user.id).x,before,'服务端推进角色位置');
});

test('server validates move targets and rate limits', () => {
 const world=createWorld();
 const a=join(world,'限速测试');
 move(a,0,0); // 原子雕塑附近仍可走；落在建筑内的点击会被落到最近可走点
 assert.equal(a.last().t,'move-ok');
 for(let i=0;i<10;i++)move(a,i%2?3:-3,i%2?8:-8);
 assert.ok(a.find('move-ok').length<=7,'每秒最多 6 次移动指令');
});

test('private chat reaches only the two participants', () => {
 const world=createWorld();
 const a=join(world,'私聊甲'),b=join(world,'私聊乙'),c=join(world,'私聊丙');
 a.say({t:'chat-invite',to:b.session.user.id,id:'inv-1'});
 assert.equal(b.last().t,'chat-invited');
 b.say({t:'chat-accept',from:a.session.user.id,id:'inv-1'});
 assert.equal(a.last().t,'chat-start');
 assert.equal(b.last().t,'chat-start');
 a.say({t:'chat-send',to:b.session.user.id,id:'msg-1',text:'你好，私聊消息'});
 assert.equal(a.last().t,'chat-ack');
 assert.equal(b.last().t,'chat-msg');
 assert.equal(b.last().text,'你好，私聊消息');
 // 第三方收不到任何私聊内容，只在快照里看到“交谈中”。
 assert.equal(c.find('chat-msg').length,0);
 world.tick(.1);
 const snapForC=c.last();
 const u1=snapForC.actors.find(x=>x.id===a.session.user.id);
 assert.equal(u1.chat,true);
 // 幂等：重发同 id 只确认不转发。
 a.say({t:'chat-send',to:b.session.user.id,id:'msg-1',text:'重复消息'});
 assert.equal(b.find('chat-msg').length,1,'重复 id 不重复转发');
 // 未在会话中发送被拒绝。
 c.say({t:'chat-send',to:a.session.user.id,id:'msg-2',text:'旁听'});
 assert.equal(c.last().t,'chat-error');
 // 离开会话通知对方。
 a.say({t:'chat-leave'});
 assert.equal(b.last().t,'chat-end');
});

test('blocking rejects future invites from that account', () => {
 const world=createWorld();
 const a=join(world,'屏蔽甲'),b=join(world,'屏蔽乙');
 b.say({t:'block',userId:a.session.user.id});
 assert.equal(b.last().t,'blocked');
 a.say({t:'chat-invite',to:b.session.user.id,id:'inv-1'});
 assert.equal(a.last().t,'invite-failed');
 assert.equal(a.last().reason,'blocked');
});

test('a second tab takes over control of the same account', () => {
 const world=createWorld();
 const a=join(world,'接管甲');
 const a2=join(world,'接管甲');
 assert.equal(a.last().t,'taken-over');
 assert.deepEqual(a.closed,{code:4001,reason:'taken_over'});
 assert.equal(a2.find('welcome').length,1,'新连接获得控制权');
 assert.equal(world.connections.size,1,'旧控制连接被清理');
});

test('room capacity is enforced and disconnect keeps identity for reconnect', () => {
 const world=createWorld({capacity:2});
 const a=join(world,'容量甲'),b=join(world,'容量乙'),c=join(world,'容量丙');
 assert.equal(c.find('room-queued').length,1,'满员时进入队列而不是被拒绝');
 assert.equal(world.connections.size,3,'排队连接保持');
 // 断线后身份保留：其他人看不到，重连续场（同一账号令牌）。
 move(a,6,6);
 for(let i=0;i<100;i++)world.tick(.1);
 const id=a.session.user.id;
 const x=world.actors.get(id).x,z=world.actors.get(id).z;
 a.emit('close');
 assert.equal(world.actors.get(id).online,false);
 assert.ok(!world.snapshot().some(actor=>actor.id===id),'断线后从公开快照消失');
 const a2=new MockSocket();
 world.connect(a2);
 a2.say({t:'hello',token:a.session.token});
 assert.equal(a2.find('welcome').length,1);
 assert.equal(world.actors.get(id).x,x,'重连续场保留位置');
 assert.equal(world.actors.get(id).z,z);
 // 超过宽限期后身份清理。
 b.emit('close');
 world.actors.get(b.session.user.id).lastSeen=Date.now()-61000;
 world.tick(.1);
 assert.equal(world.actors.has(b.session.user.id),false,'超过宽限期的身份被清理');
});

test('AI companions live in the room only while a human is present', () => {
 const world=createWorld();
 // 无人在线：世界休眠，快照里没有 AI。
 world.tick(.1);
 assert.equal(world.snapshot().length,0);
 const a=join(world,'观展甲');
 const actors=a.find('welcome')[0].actors;
 assert.equal(actors.filter(x=>x.ai).length,8,'真人入场后八位 AI 侠客在房间里');
 assert.ok(actors.every(x=>x.ai||x.id===a.session.user.id));
 for(const ai of actors.filter(x=>x.ai))assert.equal(ai.chat,false);
 // AI 随时间活动：位置会变化。
 const before=world.engine.agents.map(x=>({id:x.id,x:x.x,z:x.z}));
 for(let i=0;i<600;i++)world.tick(.1);
 const moved=world.engine.agents.filter((x,i)=>x.x!==before[i].x||x.z!==before[i].z);
 assert.ok(moved.length>0,'AI 侠客在服务端活动中');
});

test('a human can chat with an AI companion and the reply cites real works only', async () => {
 const world=createWorld();
 const a=join(world,'AI聊天甲'),b=join(world,'AI聊天乙');
 a.say({t:'chat-invite',to:'ayuan',id:'inv-1'});
 const start=a.find('chat-start').at(-1);
 assert.equal(start.with.id,'ayuan');
 assert.equal(start.with.ai,true);
 assert.equal(world.engine.agents.find(x=>x.id==='ayuan').held,true,'私聊打断 AI 的公开活动');
 // 忙碌的 AI 不能被第二人邀请。
 b.say({t:'chat-invite',to:'ayuan',id:'inv-2'});
 assert.equal(b.last().t,'invite-failed');
 // 提问检索：回复只引用真实已发布作品，并标注演示模式（异步大脑）。
 a.say({t:'chat-send',to:'ayuan',id:'msg-1',text:'推荐效率工具作品'});
 assert.equal(a.find('chat-ack').length,0,'回复就绪前用户消息保持发送中');
 await new Promise(r=>setTimeout(r,50));
 const reply=a.find('chat-msg').at(-1);
 assert.equal(reply.from,'ayuan');
 assert.equal(reply.ai,true);
 assert.equal(reply.mode,'demo');
 assert.ok(reply.workIds.length>0);
 for(const id of reply.workIds)assert.ok(id.startsWith('funskills--')||id.startsWith('hackathon--'),'作品 ID 必须来自已发布目录');
 assert.equal(a.find('chat-ack').length,1,'回复与确认一起到达');
 // 第三方读不到与 AI 的私聊内容。
 assert.equal(b.find('chat-msg').length,0);
 // 离开会话后 AI 恢复公开活动，会话历史被清除。
 a.say({t:'chat-leave'});
 assert.equal(world.engine.agents.find(x=>x.id==='ayuan').held,false);
});

test('public activity feed carries only public AI events', () => {
 const world=createWorld();
 const a=join(world,'活动甲');
 const welcome=a.find('welcome')[0];
 assert.ok(Array.isArray(welcome.activity));
 for(let i=0;i<1200;i++)world.tick(.1);
 const activity=a.find('activity').at(-1);
 assert.ok(activity&&activity.events.length>0,'AI 活动进入公开流');
 for(const e of activity.events){
  assert.ok(['walk','chat','view','phase'].includes(e.kind));
  assert.ok(!/私聊|记忆/.test(e.text),'公开活动不得包含私人信息');
 }
});

test('a full room queues newcomers and admits them FIFO when a slot frees', async () => {
 // 缩短 reclaim 窗口便于测试空位补位。
 const world=createWorld({capacity:2,reclaimWindowMs:50});
 const a=join(world,'排队甲'),b=join(world,'排队乙');
 const c=new MockSocket();
 world.connect(c);
 const sessionC=accountFor('排队丙');
 c.say({t:'hello',token:sessionC.token});
 // 满员：进入队列而不是被拒绝，连接保持。
 const queued=c.find('room-queued').at(-1);
 assert.equal(queued.position,1);
 assert.equal(queued.capacity,2);
 assert.equal(c.closed,null,'排队不断开连接');
 assert.equal(world.waiters.length,1);
 // 第二个等待者排在后面。
 const d=new MockSocket();
 world.connect(d);
 d.say({t:'hello',token:accountFor('排队丁').token});
 assert.equal(d.find('room-queued').at(-1).position,2);
 // 一人离开：reclaim 窗口过后队首自动准入，其余位置前移。
 b.emit('close');
 assert.equal(c.find('welcome').length,0,'窗口内名额保留给重连，不立即补位');
 await new Promise(r=>setTimeout(r,80)); // reclaim 窗口按真实时间计算
 for(let i=0;i<5;i++)world.tick(.1);
 assert.equal(c.find('welcome').length,1,'窗口过后空位自动补给队首');
 assert.equal(d.find('queue-position').at(-1).position,1,'等待者位置前移');
 assert.equal(world.waiters.length,1);
 // 取消排队：移出队列并确认。
 d.say({t:'leave-queue'});
 assert.equal(d.find('queue-left').length,1);
 assert.equal(world.waiters.length,0);
});

test('a disconnected account reclaims its slot ahead of the queue', () => {
 const world=createWorld({capacity:2});
 const a=join(world,'重连甲'),b=join(world,'重连乙');
 const c=new MockSocket();
 world.connect(c);
 c.say({t:'hello',token:accountFor('重连丙').token});
 assert.equal(c.find('room-queued').length,1,'满员时排队');
 // 甲断线后重连（同令牌）：直接 reclaim，不占用排队名额。
 a.emit('close');
 const a2=new MockSocket();
 world.connect(a2);
 a2.say({t:'hello',token:a.session.token});
 assert.equal(a2.find('welcome').length,1,'断线重连优先 reclaim');
 assert.equal(world.waiters.length,1,'排队者仍在等待（重连不释放名额给队列）');
});

test('emotes broadcast publicly and are rate limited', () => {
 const world=createWorld();
 const a=join(world,'表情甲'),b=join(world,'表情乙');
 a.say({t:'emote',emote:'wave'});
 const emote=b.find('emote').at(-1);
 assert.equal(emote.from,a.session.user.id);
 assert.equal(emote.emote,'wave');
 assert.equal(emote.name,'表情甲');
 // 3 秒限速：紧接着再发被忽略。
 a.say({t:'emote',emote:'clap'});
 assert.equal(b.find('emote').length,1,'3 秒内不重复广播');
 // 非法值回退为 wave，且不泄露私聊内容。
 a.say({t:'emote',emote:''});
 assert.equal(b.find('emote').length,1);
});

test('observers only see that players are talking, never the content', () => {
 const world=createWorld();
 const a=join(world,'旁观甲'),b=join(world,'旁观乙'),c=join(world,'旁观丙');
 a.say({t:'chat-invite',to:b.session.user.id,id:'inv-1'});
 b.say({t:'chat-accept',from:a.session.user.id,id:'inv-1'});
 a.say({t:'chat-send',to:b.session.user.id,id:'msg-1',text:'私聊内容不应外泄'});
 assert.equal(c.find('chat-msg').length,0,'第三方收不到私聊');
 world.tick(.1);
 const snap=c.find('snapshot').at(-1);
 const talking=snap.actors.filter(x=>x.chat);
 assert.equal(talking.length,2,'旁观者看到双方在交谈中');
 assert.ok(!JSON.stringify(snap).includes('私聊内容'),'快照不含私聊正文');
});

test('hall companions walk between stands and observe without clipping through them', async () => {
 const {createHallAgents,advanceHallAgent,hallAgentLabel}=await import('../src/world/hallAgents.js');
 const {hallWalkable}=await import('../src/world/engine.js');
 const stands=[{id:'w1',title:'电商视频全能版',x:-6.75,z:-5},{id:'w2',title:'跨境选品智能分析',x:-2.25,z:-5},{id:'w3',title:'电商梗片导演',x:2.25,z:-5},{id:'w4',title:'电商超级智能体',x:6.75,z:-5},{id:'w5',title:'中国电商全链路',x:-6.75,z:3},{id:'w6',title:'财报智读',x:-2.25,z:3},{id:'w7',title:'破冰协议',x:2.25,z:3},{id:'w8',title:'SkillHub',x:6.75,z:3}];
 const agents=createHallAgents(stands,[{id:'ayuan',name:'阿原'},{id:'shouguan',name:'知微'},{id:'qinghe',name:'青禾'},{id:'moyu',name:'墨语'},{id:'xingzhou',name:'行舟'},{id:'xiaoman',name:'小满'},{id:'zhaolu',name:'朝露'},{id:'xinghe',name:'星河'}]);
 const visited=new Set();
 let observedLabels=0;
 for(let i=0;i<7200;i++){ // 12 分钟模拟
  for(const ha of agents){
   advanceHallAgent(ha,stands,.1);
   if(ha.stand)visited.add(ha.stand.id);
   if(hallAgentLabel(ha))observedLabels++;
   assert.ok(hallWalkable(Math.round(ha.x),Math.round(ha.z))||ha.path.length,'展厅侠客不穿模（静止时可走、行走中在路径上）');
   assert.ok(Number.isFinite(ha.x)&&Number.isFinite(ha.z));
  }
 }
 assert.ok(visited.size>=6,'12 分钟内应覆盖大部分展位');
 assert.ok(observedLabels>100,'驻足观展并浮现书名气泡');
 const states=new Set(agents.map(a=>a.state));
 assert.ok(states.size>=1);
});

test('tea house seats: sit locks position, occupancy is public, standing frees the seat', async () => {
 const {SEATS}=await import('../src/world/config.js');
 const world=createWorld();
 const a=join(world,'共坐甲'),b=join(world,'共坐乙');
 // 太远不能入座。
 a.say({t:'sit',seat:SEATS[0].id,id:'s1'});
 assert.equal(a.last().t,'sit-reject');
 assert.equal(a.last().reason,'far');
 // 茶楼里可能已有 AI 侠客落座：先走到茶楼等它们安顿，再逐个找空位入座。
 a.say({t:'move',x:-10,z:-2,id:'m0'});
 for(let i=0;i<400;i++)world.tick(.1);
 let seat=null;
 for(const s of SEATS){
  a.say({t:'move',x:s.x,z:s.z+1.5,id:'m-'+s.id});
  for(let i=0;i<250;i++)world.tick(.1);
  if(world.engine.agents.some(x=>x.seat===s.id))continue;
  a.say({t:'sit',seat:s.id,id:'s-'+s.id});
  if(a.find('sit-ok').length){seat=s;break;}
 }
 assert.ok(seat,'入座成功');
 assert.equal(world.actors.get(a.session.user.id).x,seat.x,'位置锁定到座位');
 // 入座后不能行走。
 a.say({t:'move',x:0,z:0,id:'m2'});
 assert.equal(a.last().reason,'seated','入座后移动被拒绝');
 // 占用对全房间公开（含昵称），但快照不含私聊内容。
 world.tick(.1);
 const seatsMsg=b.find('seats').at(-1);
 assert.ok(seatsMsg.seats.some(x=>x.seat===seat.id&&x.name==='共坐甲'),'其他人看到谁坐了哪里');
 // 第二人不能坐同一个位置。
 b.say({t:'move',x:seat.x,z:seat.z+1.5,id:'m3'});
 for(let i=0;i<250;i++)world.tick(.1);
 b.say({t:'sit',seat:seat.id,id:'s3'});
 assert.equal(b.last().reason,'occupied');
 // 起身释放座位。
 a.say({t:'stand'});
 assert.equal(a.find('stand-ok').length,1);
 assert.equal(world.actors.get(a.session.user.id).seat,null);
 // 断线自动离座。
 a.say({t:'sit',seat:seat.id,id:'s4'});
 a.emit('close');
 assert.equal(world.actors.get(a.session.user.id).seat,null,'断线自动离座');
});

test('tea house AI guests: agents take a seat, block it from humans, and stand up when they leave', async () => {
 const {SEATS}=await import('../src/world/config.js');
 const world=createWorld();
 const a=join(world,'茶客甲');
 // 真人先走到茶楼入口附近站着（不挡任何座位），等 AI 侠客按时辰入座。
 a.say({t:'move',x:-10,z:-2,id:'m0'});
 for(let i=0;i<400;i++)world.tick(.1);
 let guest=null;
 for(let i=0;i<3000&&!guest;i++){world.tick(.1);guest=world.engine.agents.find(x=>x.seat)||null;}
 assert.ok(guest,'有 AI 侠客入座茶楼');
 const seat=SEATS.find(s=>s.id===guest.seat);
 assert.equal(guest.state,'茶楼小坐','AI 入座状态');
 assert.ok(Math.hypot(guest.x-seat.x,guest.z-seat.z)<.01,'AI 位置锁定到座位');
 assert.equal(guest.angle,seat.angle,'AI 面向茶桌');
 // 占用公开：seats 广播与 tick 快照都能看到是谁。
 const seatsMsg=a.find('seats').at(-1);
 assert.ok(seatsMsg&&seatsMsg.seats.some(x=>x.seat===guest.seat&&x.name===guest.name),'AI 占用通过 seats 广播公开');
 assert.ok(world.snapshot().some(x=>x.id===guest.id&&x.seat===guest.seat),'快照包含 AI 的座位');
 // 真人不能坐 AI 占着的座位。
 a.say({t:'sit',seat:seat.id,id:'s1'});
 assert.equal(a.last().t,'sit-reject');
 assert.equal(a.last().reason,'occupied','AI 占着的座位真人不能坐');
 // AI 出发离开：座位自动释放并广播。
 for(let i=0;i<900&&world.engine.agents.find(x=>x.id===guest.id).seat;i++)world.tick(.1);
 assert.equal(world.engine.agents.find(x=>x.id===guest.id).seat,null,'AI 起身离开后释放座位');
 assert.ok(!a.find('seats').at(-1).seats.some(x=>x.userId===guest.id),'广播中不再显示该座位被占');
});

test('tea house table talk: sitting and standing become public activity events', async () => {
 const {SEATS}=await import('../src/world/config.js');
 const world=createWorld();
 const a=join(world,'事件甲');
 // 走到茶楼等 AI 安顿，再找空位入座。
 a.say({t:'move',x:-10,z:-2,id:'m0'});
 for(let i=0;i<400;i++)world.tick(.1);
 let seat=null;
 for(const s of SEATS){
  a.say({t:'move',x:s.x,z:s.z+1.5,id:'m-'+s.id});
  for(let i=0;i<250;i++)world.tick(.1);
  if(world.engine.agents.some(x=>x.seat===s.id))continue;
  a.say({t:'sit',seat:s.id,id:'s-'+s.id});
  if(a.find('sit-ok').length){seat=s;break;}
 }
 assert.ok(seat,'入座成功');
 const sitEvent=world.activity.find(e=>e.kind==='rest'&&e.text.includes('事件甲')&&e.text.includes(seat.label));
 assert.ok(sitEvent,'入座写入活动流：'+JSON.stringify(sitEvent||null));
 // 起身同样公开。
 a.say({t:'stand'});
 const standEvent=world.activity.find(e=>e.kind==='rest'&&e.text.includes('事件甲')&&e.text.includes('起身'));
 assert.ok(standEvent,'离座写入活动流：'+JSON.stringify(standEvent||null));
 // AI 落座也会写活动流（此前应已有 AI 入座事件）。
 const aiEvent=world.activity.find(e=>e.kind==='rest'&&world.engine.agents.some(x=>x.name===e.text.split('在茶楼坐了')[0]));
 assert.ok(aiEvent,'AI 落座写入活动流：'+JSON.stringify(aiEvent||null));
});

test('unauthenticated connections are reaped after the hello timeout', async () => {
 const world=createWorld({helloTimeoutMs:60});
 const silent=new MockSocket();
 world.connect(silent);
 // 只连不发 hello：超时后被服务端主动关闭，不长期占用连接。
 await new Promise(r=>setTimeout(r,120));
 assert.equal(silent.closed?.code,4008,'未认证连接超时被断开');
 assert.equal(world.connections.size,0,'连接已清理');
 // 发了 hello 的连接不受影响。
 const good=join(world,'认证甲');
 assert.equal(good.find('welcome').length,1,'正常连接仍然欢迎');
 await new Promise(r=>setTimeout(r,120));
 assert.equal(good.closed,null,'已认证连接不会被超时断开');
});

test('AI presence: recent activity and impressions are broadcast separately from the 10Hz snapshot', async () => {
 const world=createWorld();
 const a=join(world,'见闻甲');
 // welcome 即带当前 presence（不必等低频广播）。
 const welcome=a.find('welcome')[0];
 assert.ok(Array.isArray(welcome.presence)&&welcome.presence.length===8,'welcome 携带 8 位 AI 的见闻');
 const entry=welcome.presence.find(p=>p.id==='qinghe');
 assert.ok(entry,'包含青禾');
 assert.ok(Array.isArray(entry.recent),'recent 是数组');
 assert.ok(Array.isArray(entry.views),'views 是数组');
 // 10Hz 位置快照保持精简：AI 演员不带 memory/views。
 const snap=a.find('snapshot').at(-1);
 const aiActor=snap.actors.find(x=>x.id==='qinghe');
 assert.ok(aiActor&&!('memory' in aiActor)&&!('views' in aiActor),'位置快照不含见闻重负载');
 // presence 广播：AI 有动态后到达，且只在变化时发送。
 const before=a.sent.filter(m=>m.t==='presence').length;
 for(let i=0;i<400&&a.sent.filter(m=>m.t==='presence').length===before;i++)world.tick(.1);
 const presenceMsgs=a.find('presence');
 assert.ok(presenceMsgs.length>before,'AI 见闻通过 presence 广播送达');
 const last=presenceMsgs.at(-1);
 assert.ok(last.agents.length===8,'presence 覆盖 8 位 AI');
 assert.ok(last.agents.every(p=>Array.isArray(p.recent)&&Array.isArray(p.views)),'每位 AI 带 recent 与 views');
});
