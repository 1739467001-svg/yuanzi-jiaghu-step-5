// 房间枢纽：每个房间是一个独立的权威世界（位置、私聊、AI 侠客互不串通）。
// 升级请求按 ?room=id 路由；默认房间 jianghu，可用 ATOM_ROOMS 增加。
import {WebSocketServer} from 'ws';
import {createWorld,originAllowed} from './world.mjs';
import {ledgerSummary} from './budget.mjs';
import {isAdminRequest} from './publication-store.mjs';

export function parseRoomSpecs(env={}){
 const rooms=[{id:'jianghu',name:'原子江湖 · 主镇',capacity:Math.max(2,Number(env.ATOM_ROOM_CAPACITY)||20)}];
 for(const spec of String(env.ATOM_ROOMS||'').split(',').map(s=>s.trim()).filter(Boolean)){
  const [id,name,cap]=spec.split(':').map(s=>s.trim());
  if(!id||id==='jianghu')continue;
  rooms.push({id,name:name||id,capacity:Math.max(2,Number(cap)||20)});
 }
 return rooms;
}
export function createRoomHub({env={},reclaimWindowMs}={}){
 const specs=parseRoomSpecs(env);
 const worlds=new Map();
 // 同一账号同时只在一个房间：进入新房时把旧房的连接踢出。
 const accountRoom=new Map();
 for(const spec of specs){
  const roomId=spec.id;
  worlds.set(roomId,createWorld({env,capacity:spec.capacity,reclaimWindowMs,guard:userId=>{
   const current=accountRoom.get(userId);
   if(current&&current!==roomId)worlds.get(current)?.kick(userId,'room-switched');
   accountRoom.set(userId,roomId);
  }}));
 }
 const get=id=>worlds.get(id)||null;
 const list=()=>specs.map(meta=>{
  const world=worlds.get(meta.id);
  const actors=[...world.actors.values()];
  return {id:meta.id,name:meta.name,capacity:meta.capacity,online:actors.filter(a=>a.online).length,waiting:world.waiters.length};
 });
 function attach(httpServer,path='/ws/world',{allowedOrigins=[]}={}){
  const wss=new WebSocketServer({noServer:true});
  httpServer.on('upgrade',(req,socket,head)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname!==path)return;
   if(!originAllowed(req,allowedOrigins)){socket.destroy();return;}
   const world=worlds.get(url.searchParams.get('room')||'jianghu');
   if(!world){socket.destroy();return;}
   wss.handleUpgrade(req,socket,head,ws=>world.connect(ws));
  });
  return wss;
 }
 function tick(dt){for(const world of worlds.values())world.tick(dt);}
 // 运维统计：房间占用 + 在线角色总数 + AI 运行时状态。
 function stats(){
  const rooms=list();
  return {rooms,roomCount:rooms.length,actorsOnline:rooms.reduce((s,r)=>s+r.online,0),actorsWaiting:rooms.reduce((s,r)=>s+r.waiting,0)};
 }
 return {worlds,get,list,attach,tick,stats,defaultRoom:'jianghu'};
}
// GET /api/rooms：房间占用（在线/等待/容量），不含任何私人信息。
// GET /api/ops（管理令牌）：房间占用 + 模型与预算 + 进程状态，供运营后台“运行状态”页签。
export function roomsApiPlugin(hub,{env={},isAdminRequest=()=>false}={}){
 const plugin={name:'atom-rooms',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/rooms'&&req.method==='GET'){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({rooms:hub.list()}));
   }
   if(url.pathname==='/api/ops'&&req.method==='GET'){
    if(!isAdminRequest(req,env)){res.statusCode=401;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error:'需要本地运营令牌'}));}
    const memory=process.memoryUsage();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({
     ok:true,
     uptimeSec:Math.round(process.uptime()),
     memory:{rssMB:Math.round(memory.rss/1048576),heapUsedMB:Math.round(memory.heapUsed/1048576)},
     model:{configured:!!env.ATOM_LLM_API_KEY,model:env.ATOM_LLM_MODEL||null,budget:ledgerSummary(env)},
     world:hub.stats(),
    }));
   }
   return next();
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
