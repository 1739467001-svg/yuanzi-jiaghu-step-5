import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// 账号与各房间数据写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-rooms-'));
process.env.ATOM_DATA_DIR=tmp;
const {register,login} = await import('../server/accounts.mjs');
const {createRoomHub,parseRoomSpecs} = await import('../server/rooms.mjs');
const {WebSocket} = await import('ws');

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
function accountFor(label){try{register(label,'password123');}catch{}return login(label,'password123');}
function join(hub,roomId,label){
 const ws=new MockSocket();
 hub.get(roomId).connect(ws);
 const session=accountFor(label);
 ws.say({t:'hello',token:session.token});
 ws.session=session;
 return ws;
}

test('room specs parse the default room plus ATOM_ROOMS extras', () => {
 const specs=parseRoomSpecs({ATOM_ROOM_CAPACITY:'20',ATOM_ROOMS:'teahouse:江湖茶楼:5, garden:后花园'});
 assert.deepEqual(specs.map(r=>r.id),['jianghu','teahouse','garden']);
 assert.equal(specs[0].name,'原子江湖 · 主镇');
 assert.equal(specs[1].capacity,5);
 assert.equal(specs[2].capacity,20,'未写容量用默认值');
});

test('rooms are isolated worlds: actors, chat and occupancy do not cross rooms', () => {
 const hub=createRoomHub({env:{ATOM_ROOMS:'teahouse:江湖茶楼:5'},reclaimWindowMs:50});
 const a=join(hub,'jianghu','隔离甲');
 const b=join(hub,'teahouse','隔离乙');
 assert.equal(a.find('welcome').length,1);
 assert.equal(b.find('welcome').length,1);
 // 彼此不在对方的快照里。
 const snapA=a.find('snapshot').at(-1);
 const snapB=b.find('snapshot').at(-1);
 assert.ok(!snapA.actors.some(x=>x.id===b.session.user.id),'主镇看不到茶楼的人');
 assert.ok(!snapB.actors.some(x=>x.id===a.session.user.id),'茶楼看不到主镇的人');
 // 占用统计分开。
 const list=hub.list();
 assert.equal(list.find(r=>r.id==='jianghu').online,1);
 assert.equal(list.find(r=>r.id==='teahouse').online,1);
 // 每个房间都有自己的 AI 侠客。
 for(const room of list){
  const world=hub.get(room.id);
  world.tick(.1);
  assert.equal(world.engine.agents.length,8,'每个房间独立运行八位 AI');
 }
});

test('the same account is only in one room at a time', () => {
 const hub=createRoomHub({env:{ATOM_ROOMS:'teahouse:江湖茶楼:5'},reclaimWindowMs:50});
 const session=accountFor('双房甲');
 const inMain=new MockSocket();
 hub.get('jianghu').connect(inMain);
 inMain.say({t:'hello',token:session.token});
 assert.equal(inMain.find('welcome').length,1);
 // 同一账号进入茶楼：主房的连接被踢出。
 const inTea=new MockSocket();
 hub.get('teahouse').connect(inTea);
 inTea.say({t:'hello',token:session.token});
 assert.equal(inTea.find('welcome').length,1,'新房准入');
 assert.equal(inMain.last().t,'kicked','旧房连接被踢出');
 assert.deepEqual(inMain.closed.code,4004);
 assert.equal(hub.list().find(r=>r.id==='jianghu').online,0,'旧房不再计在线');
});

test('upgrade requests route by room and unknown rooms are refused', async () => {
 const hub=createRoomHub({env:{ATOM_ROOMS:'teahouse:江湖茶楼:5'},reclaimWindowMs:50});
 const server=http.createServer();
 hub.attach(server,'/ws/world',{allowedOrigins:[]});
 await new Promise(r=>server.listen(0,r));
 const port=server.address().port;
 const open=room=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws/world?room=${room}`);
  ws.on('open',()=>resolve(ws));
  ws.on('error',reject);
  setTimeout(()=>reject(new Error('timeout')),3000);
 });
 const main=await open('jianghu');
 const tea=await open('teahouse');
 assert.equal(hub.get('jianghu').connections.size,1);
 assert.equal(hub.get('teahouse').connections.size,1);
 // 未知房间与伪造来源都被拒绝。
 const unknown=await new Promise(resolve=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws/world?room=ghost`);
  ws.on('open',()=>resolve('opened'));ws.on('error',()=>resolve('rejected'));
  setTimeout(()=>resolve('timeout'),3000);
 });
 assert.equal(unknown,'rejected');
 const evil=await new Promise(resolve=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws/world?room=jianghu`,{headers:{Origin:'https://evil.example.com'}});
  ws.on('open',()=>resolve('opened'));ws.on('error',()=>resolve('rejected'));
  setTimeout(()=>resolve('timeout'),3000);
 });
 assert.equal(evil,'rejected','伪造来源被拒');
 main.close();tea.close();
 await new Promise(r=>server.close(r));
});

test('ops endpoint requires the admin token and reports world plus budget', async () => {
 const {roomsApiPlugin}=await import('../server/rooms.mjs');
 const hub=createRoomHub({env:{},reclaimWindowMs:50});
 const plugin=roomsApiPlugin(hub,{env:{},isAdminRequest:req=>req.headers['x-atom-admin']==='atom-local-demo'});
 let handler;
 plugin.configureServer({middlewares:{use:fn=>{handler=fn;}}});
 const fakeRes=()=>({statusCode:200,body:'',setHeader(){},end(data){this.body=data||'';}});
 // 无令牌：401。
 const denied=fakeRes();
 handler({url:'/api/ops',method:'GET',headers:{}},denied,()=>{});
 assert.equal(denied.statusCode,401);
 // 有令牌：世界、模型预算与进程状态。
 const ok=fakeRes();
 handler({url:'/api/ops',method:'GET',headers:{'x-atom-admin':'atom-local-demo'}},ok,()=>{});
 const body=JSON.parse(ok.body);
 assert.ok(body.ok);
 assert.ok(body.world.rooms.length>=1);
 assert.equal(typeof body.model.configured,'boolean');
 assert.ok(body.model.budget&&typeof body.model.budget.level==='string');
 assert.ok(body.memory.rssMB>0,'进程内存可见');
 assert.ok(body.uptimeSec>=0);
 // /api/rooms 无需令牌且只含公开字段。
 const rooms=fakeRes();
 handler({url:'/api/rooms',method:'GET',headers:{}},rooms,()=>{});
 const roomsBody=JSON.parse(rooms.body);
 assert.ok(roomsBody.rooms.every(r=>['id','name','capacity','online','waiting'].every(k=>k in r)));
});
