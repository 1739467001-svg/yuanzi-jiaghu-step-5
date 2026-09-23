// 服务端权威世界（本地演示）：一个房间、容量上限、10Hz 公开快照。
// 服务端校验可走区域与目标、计算路径、推进移动；邀请/接受/拒绝/离开/发送
// 都验证身份与参与关系；私聊只送达两名参与者，世界快照只含公开字段。
// 八位 AI 侠客作为服务端角色与真人同房间生活（阶段 5）；无人时世界休眠。
// 这是自包含的本地演示，尚未接入 AI Town 与生产鉴权。
import {WebSocketServer} from 'ws';
import {walkable,nearestWalkable,findPath,stepActor,WorldEngine} from '../src/world/engine.js';
import {SEATS} from '../src/world/config.js';
import {livePublishedWorks,getStateVersion} from './publication-store.mjs';
import {generateAgentReply} from './agent-brain.mjs';
import {verify as verifySession} from './accounts.mjs';

const TICK_MS=100,RECONNECT_GRACE_MS=60000,INVITE_TIMEOUT_MS=30000,MOVE_RATE=6,MAX_TEXT=500,SEEN_LIMIT=500;
// 断线后的名额保留窗口：窗口内重连直接 reclaim，窗口过后名额才释放给排队者。
const RECLAIM_WINDOW_MS=15000;
const SPAWNS=[[-3,1],[2,0],[-8,2],[6,2],[-2,-2],[8,-2],[-8,-6],[6,-6],[12,4],[-12,-2]];

const round=v=>Math.round(v*100)/100;
const now=()=>Date.now();
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=40;
const validName=v=>typeof v==='string'&&[...v.trim()].length>0&&[...v.trim()].length<=20;
const validColor=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);

// 来源校验：无 Origin（非浏览器客户端）或同源放行；其余需在 ATOM_ALLOWED_ORIGINS 白名单。
// 防跨站 WebSocket 劫持（CSWSH）：第三方页面不能用浏览器的会话连你的世界。
export function originAllowed(req,allowedOrigins){
 const origin=req.headers.origin;
 if(!origin)return true;
 try{
  const host=new URL(origin).host;
  if(host===req.headers.host)return true;
  return allowedOrigins.some(o=>o===origin||o===host);
 }catch{return false;}
}
export function createWorld({capacity=20,env={},reclaimWindowMs=RECLAIM_WINDOW_MS,guard=null}={}){
 const actors=new Map(),connections=new Map(),invites=new Map(),seen=new Set();
 // 满员时的 FIFO 等待队列（连接保持，令牌在准入时重新验证）。
 const waiters=[];
 // 与 AI 的私聊会话历史（内存中最近 8 条，仅用于模型上下文；断开即弃）。
 const aiHistory=new Map();
 let nextConn=0,activityClock=0;
 const onlineCount=()=>[...actors.values()].filter(a=>a.online).length;
 // 占用名额 = 在线角色 + 断线但仍在 reclaim 窗口内的角色（窗口内重连优先 reclaim）。
 const slotsUsed=()=>[...actors.values()].filter(a=>a.online||now()<(a.reclaimUntil||0)).length;
 // AI 运行时：八位侠客的服务端状态机；公开事件进入活动流。
 const activity=[];
 const engine=new WorldEngine(e=>{activity.push(e);if(activity.length>24)activity.shift();});
 engine.setWorks(livePublishedWorks());
 let worksVersion=getStateVersion(),worksChecked=0;
 const isAi=id=>engine.agents.some(a=>a.id===id);
 const aiAgent=id=>engine.agents.find(a=>a.id===id)||null;
 const humansOnline=()=>[...actors.values()].filter(a=>a.online).length;
 const publicActor=a=>({id:a.id,name:a.name,color:a.color,x:round(a.x),z:round(a.z),angle:round(a.angle),state:a.state,chat:!!a.chatWith,seat:a.seat||null});
 const seatOccupancy=()=>[
  ...[...actors.values()].filter(a=>a.online&&a.seat).map(a=>({seat:a.seat,userId:a.id,name:a.name,ai:!!a.ai,chat:!!a.chatWith})),
  // AI 侠客也会坐进茶楼：占用同样对全房间公开（含昵称）。
  ...(humansOnline()>0?engine.agents.filter(a=>a.seat).map(a=>({seat:a.seat,userId:a.id,name:a.name,ai:true,chat:!!a.held})):[]),
 ];
 // 茶楼聚散进入"江湖此刻"：入座、离座与 AI 落座都是公开事件。
 const noteSeatEvent=text=>{activity.push({id:`rest-${now()}-${Math.random().toString(36).slice(2,6)}`,text,kind:'rest',time:Date.now()});if(activity.length>24)activity.shift();};
 const snapshot=()=>[
  ...[...actors.values()].filter(a=>a.online).map(publicActor),
  // 有真人在场时 AI 侠客才在房间里活动；无人时世界休眠（PRD 15.2）。
  ...(humansOnline()>0?engine.agents.map(a=>({id:a.id,name:a.name,color:a.color,x:round(a.x),z:round(a.z),angle:round(a.angle),state:a.state,chat:!!a.held,ai:true,seat:a.seat||null})):[]),
 ];
 // AI 侠客入座茶楼：没有行程又停在茶桌旁的，找个空位坐下歇脚（坐着也能被邀请闲聊）；
 // 引擎一分配新行程就起身让座；占用变化补发 seats 广播，座位面板随之更新。
 function aiSeatTick(){
  let changed=false;
  for(const a of engine.agents){
   if(a.path.length){if(a.seat){a.seat=null;changed=true;}continue;}
   if(a.seat||a.held)continue;
   if(!SEATS.some(s=>Math.hypot(a.x-s.x,a.z-s.z)<6))continue;
   const taken=new Set([...actors.values()].filter(x=>x.online&&x.seat).map(x=>x.seat));
   for(const s of SEATS){
    if(taken.has(s.id)||engine.agents.some(x=>x!==a&&x.seat===s.id))continue;
    // 不往站着的人身上坐，也给正走到座前的人留着。
    if([...actors.values()].some(x=>x.online&&Math.hypot(x.x-s.x,x.z-s.z)<2.5))continue;
    a.seat=s.id;a.x=s.x;a.z=s.z;a.angle=s.angle;a.state='茶楼小坐';a.wait=Math.max(a.wait,25+(a.step*7)%9);
    noteSeatEvent(`${a.name}在茶楼坐了${s.label}`);
    changed=true;break;
   }
  }
  if(changed)broadcast({t:'seats',seats:seatOccupancy()});
 }
 const send=(conn,message)=>{try{conn.ws.send(JSON.stringify(message));}catch{}};
 const sendToUser=(userId,message)=>{const actor=actors.get(userId);if(actor?.online)send(connections.get(actor.conn),message);};
 const broadcast=message=>{for(const conn of connections.values())send(conn,message);};
 const findSpawn=()=>{
  let best=SPAWNS[0],bestScore=-1;
  for(const [x,z] of SPAWNS){
   if(!walkable(x,z))continue;
   let nearest=99;for(const a of actors.values())if(a.online)nearest=Math.min(nearest,Math.hypot(a.x-x,a.z-z));
   if(nearest>bestScore){bestScore=nearest;best=[x,z];}
  }
  return nearestWalkable(best[0],best[1]);
 };
 const endConversation=(userId,byUserId)=>{
  const actor=actors.get(userId);if(!actor?.chatWith)return;
  const partner=actor.chatWith;actor.chatWith=null;
  if(isAi(partner)){engine.release(partner);aiHistory.delete(`${userId}:${partner}`);} // 私聊结束，AI 恢复公开活动
  else{const other=actors.get(partner);if(other&&other.chatWith===userId)other.chatWith=null;sendToUser(partner,{t:'chat-end',by:byUserId});}
 };
 const expireInvites=()=>{
  for(const [id,invite] of [...invites])if(invite.expires<now()){invites.delete(id);sendToUser(invite.from,{t:'invite-expired',id});}
 };
 function handleMessage(connId,raw){
  const conn=connections.get(connId);if(!conn)return;
  let data;try{data=JSON.parse(raw);}catch{return;}
  if(!data||typeof data!=='object')return;
  const actor=conn.userId?actors.get(conn.userId):null;
  switch(data.t){
   case 'hello':return hello(conn,data);
   case 'move':{
    if(!actor||actor.conn!==connId)return;
    // 入座后位置由服务端锁定：先起身再移动。
    if(actor.seat)return send(conn,{t:'move-reject',id:data.id,reason:'seated'});
    const stamps=actor.moveStamps.filter(t=>t>now()-1000);
    actor.moveStamps=stamps;
    if(stamps.length>=MOVE_RATE)return send(conn,{t:'move-reject',id:data.id,reason:'rate'});
    stamps.push(now());
    // 服务端决定目标：点击点不可走时落到最近可走点；不可达则拒绝。
    const target=nearestWalkable(Number(data.x),Number(data.z));
    const path=findPath([actor.x,actor.z],target);
    if(!path.length)return send(conn,{t:'move-reject',id:data.id,reason:'unreachable'});
    actor.path=path;actor.state='正在前往';
    return send(conn,{t:'move-ok',id:data.id});
   }
   case 'sit':{
    // 茶楼共坐：入座锁定位置，占用进入公开快照；断线自动离座。
    if(!actor||actor.conn!==connId)return;
    if(actor.seat)return send(conn,{t:'sit-reject',id:data.id,reason:'already'});
    const seat=SEATS.find(s=>s.id===data.seat);
    if(!seat)return send(conn,{t:'sit-reject',id:data.id,reason:'missing'});
    if([...actors.values()].some(a=>a.online&&a.seat===seat.id)||engine.agents.some(a=>a.seat===seat.id))return send(conn,{t:'sit-reject',id:data.id,reason:'occupied'});
    if(Math.hypot(actor.x-seat.x,actor.z-seat.z)>6)return send(conn,{t:'sit-reject',id:data.id,reason:'far'});
    actor.seat=seat.id;actor.path=[];actor.x=seat.x;actor.z=seat.z;actor.angle=seat.angle;actor.state='茶楼小坐';
    noteSeatEvent(`${actor.name}入座${seat.label}`);
    send(conn,{t:'sit-ok',id:data.id,seat});
    return broadcast({t:'seats',seats:seatOccupancy()});
   }
   case 'stand':{
    if(!actor||actor.conn!==connId)return;
    if(!actor.seat)return;
    actor.seat=null;actor.state='自在漫游';
    noteSeatEvent(`${actor.name}起身离开茶桌`);
    send(conn,{t:'stand-ok'});
    return broadcast({t:'seats',seats:seatOccupancy()});
   }
   case 'chat-invite':{
    if(!actor||!validId(data.to)||data.to===actor.id)return;
    // 邀请 AI 侠客：立即开始（AI 不拒绝），私聊打断其公开活动；忙碌或已屏蔽时明确失败。
    if(isAi(data.to)){
     const agent=aiAgent(data.to);
     if(actor.chatWith)return send(conn,{t:'invite-failed',id:data.id,reason:'busy'});
     if(agent.held)return send(conn,{t:'invite-failed',id:data.id,reason:'busy'});
     if(actor.blocked.has(data.to))return send(conn,{t:'invite-failed',id:data.id,reason:'blocked'});
     actor.chatWith=agent.id;engine.hold(agent.id);
     return send(conn,{t:'chat-start',with:{id:agent.id,name:agent.name,color:agent.color,ai:true}});
    }
    const target=actors.get(data.to);
    if(!target?.online)return send(conn,{t:'invite-failed',id:data.id,reason:'offline'});
    if(actor.blocked.has(data.to)||target.blocked.has(actor.id))return send(conn,{t:'invite-failed',id:data.id,reason:'blocked'});
    if(actor.chatWith||target.chatWith)return send(conn,{t:'invite-failed',id:data.id,reason:'busy'});
    if([...invites.values()].some(i=>(i.from===actor.id&&i.to===data.to)||(i.from===data.to&&i.to===actor.id)))return send(conn,{t:'invite-failed',id:data.id,reason:'pending'});
    const id=validId(data.id)?data.id:`inv-${now()}-${Math.random().toString(36).slice(2,7)}`;
    invites.set(id,{id,from:actor.id,to:data.to,expires:now()+INVITE_TIMEOUT_MS});
    sendToUser(data.to,{t:'chat-invited',from:actor.id,name:actor.name,id});
    return send(conn,{t:'invite-sent',id});
   }
   case 'chat-accept':{
    if(!actor||!validId(data.from))return;
    const invite=[...invites.values()].find(i=>i.id===data.id&&i.to===actor.id&&i.from===data.from);
    if(!invite||invite.expires<now())return send(conn,{t:'invite-failed',id:data.id,reason:'expired'});
    invites.delete(invite.id);
    const from=actors.get(invite.from);
    if(!from?.online||from.chatWith)return send(conn,{t:'invite-failed',id:data.id,reason:'busy'});
    actor.chatWith=from.id;from.chatWith=actor.id;
    sendToUser(from.id,{t:'chat-start',with:{id:actor.id,name:actor.name,color:actor.color}});
    return send(conn,{t:'chat-start',with:{id:from.id,name:from.name,color:from.color}});
   }
   case 'chat-reject':{
    if(!actor||!validId(data.from))return;
    const invite=[...invites.values()].find(i=>i.id===data.id&&i.to===actor.id);
    if(!invite)return;
    invites.delete(invite.id);
    return sendToUser(invite.from,{t:'chat-rejected',from:actor.id});
   }
   case 'chat-send':{
    if(!actor||!validId(data.to)||typeof data.text!=='string'||!data.text.trim()||[...data.text].length>MAX_TEXT)return;
    if(actor.chatWith!==data.to)return send(conn,{t:'chat-error',reason:'not-in-conversation'});
    const id=validId(data.id)?data.id.slice(0,60):`msg-${now()}`;
    if(seen.has(id))return send(conn,{t:'chat-ack',id});
    seen.add(id);if(seen.size>SEEN_LIMIT)seen.delete(seen.values().next().value);
    const text=[...data.text].slice(0,MAX_TEXT).join('');
    // 私聊只送达对方；不进入世界快照。
    if(isAi(data.to)){
     // AI 侠客用统一大脑回复：优先真实模型（受持久预算约束），否则本地资料检索。
     const agent=aiAgent(data.to);
     const observations=(agent?.views||[]).map(v=>({workId:v.workId,title:v.title,tagline:v.tagline,impression:v.impression,opinion:v.opinion}));
     const key=`${actor.id}:${data.to}`;
     const history=aiHistory.get(key)||[];
     // 回复就绪前用户消息保持“发送中”，与 AI 思考时间一致。
     generateAgentReply({agentId:data.to,message:text,history,observations,env}).then(reply=>{
      aiHistory.set(key,[...history,{role:'user',content:text},{role:'assistant',content:reply.text}].slice(-8));
      send(conn,{t:'chat-msg',from:data.to,id:`ai-${id}`,text:reply.text,workIds:reply.workIds||[],ai:true,mode:reply.mode});
      send(conn,{t:'chat-ack',id});
     }).catch(()=>send(conn,{t:'chat-error',reason:'ai-unavailable'}));
     return;
    }
    sendToUser(data.to,{t:'chat-msg',from:actor.id,id,text});
    return send(conn,{t:'chat-ack',id});
   }
   case 'chat-leave':{
    if(!actor)return;
    return endConversation(actor.id,actor.id);
   }
   case 'block':{
    if(!actor||!validId(data.userId))return;
    actor.blocked.add(data.userId);
    if(actor.chatWith===data.userId)endConversation(actor.id,actor.id);
    return send(conn,{t:'blocked',userId:data.userId});
   }
   case 'profile':{
    // 名帖在 /api/auth/profile 修改后，用同一令牌同步房间内的显示。
    if(!actor)return;
    const session=verifySession(data.token);
    if(!session||session.userId!==actor.id)return;
    actor.name=session.user.name;actor.color=session.user.color;
    send(conn,{t:'profile',you:publicActor(actor)});
    return broadcast({t:'snapshot',actors:snapshot()});
   }
   case 'leave-queue':{
    const at=waiters.findIndex(w=>w.connId===conn.connId);
    if(at>=0){waiters.splice(at,1);broadcastQueue();}
    return send(conn,{t:'queue-left'});
   }
   case 'emote':{
    // 公开表情招呼：附近玩家可见 3 秒；仅广播动作本身，不携带任何私聊内容。
    if(!actor||actor.conn!==connId)return;
    const EMOTES=['wave','bow','clap','think'];
    const kind=EMOTES.includes(data.emote)?data.emote:'wave';
    const stamps=(actor.emoteStamps||[]).filter(t=>t>now()-3000);
    actor.emoteStamps=stamps;
    if(stamps.length>=1)return;
    stamps.push(now());
    return broadcast({t:'emote',from:actor.id,name:actor.name,emote:kind});
   }
  }
 }
 function hello(conn,data){
  // 身份由服务端从会话解析：无效令牌拒绝入场，客户端传入的 userId 一律忽略（禁止冒充）。
  const session=verifySession(data.token);
  if(!session){send(conn,{t:'auth-required'});try{conn.ws.close(4003,'auth_required');}catch{}return;}
  const userId=session.user.id;
  // 跨房间保护：同一账号同时只在一个房间（由枢纽的 guard 处理旧房间）。
  if(guard&&guard(userId)===false){send(conn,{t:'room-conflict'});try{conn.ws.close(4005,'room_conflict');}catch{}return;}
  const existing=actors.get(userId);
  // 同账号后进入的会话明确接管：旧控制连接收到 taken-over 后关闭。
  if(existing?.online&&existing.conn!=null){
   const old=connections.get(existing.conn);
   if(old){send(old,{t:'taken-over'});try{old.ws.close(4001,'taken_over');}catch{}}
  }
  // 断线重连优先 reclaim 自己的位置；全新身份在满员时进入 FIFO 队列等待。
  if(!existing&&slotsUsed()>=capacity){
   if(!waiters.some(w=>w.connId===conn.connId))waiters.push({connId:conn.connId,token:data.token,since:now()});
   send(conn,{t:'room-queued',position:waiters.findIndex(w=>w.connId===conn.connId)+1,waiting:waiters.length,capacity});
   broadcastQueue();
   return;
  }
  admit(conn,session,existing);
 }
 function admit(conn,session,existing){
  const userId=session.user.id;
  const spawn=findSpawn();
  // 名帖昵称与衣带色以账号为准，客户端只能通过 /api/auth/profile 修改。
  const actor=existing||{id:userId,name:session.user.name,color:session.user.color,x:spawn[0],z:spawn[1],angle:0,path:[],state:'自在漫游',online:false,conn:null,moveStamps:[],emoteStamps:[],chatWith:null,blocked:new Set(),lastSeen:0,seat:null};
  actor.name=session.user.name;actor.color=session.user.color;actor.online=true;actor.conn=conn.connId;actor.lastSeen=now();
  actors.set(userId,actor);
  conn.userId=userId;
  send(conn,{t:'welcome',you:publicActor(actor),actors:snapshot(),seats:seatOccupancy(),activity:activity.slice(-6),capacity});
  broadcast({t:'snapshot',actors:snapshot()});
 }
 // 有空位时按队列顺序自动准入；断开或令牌失效的等待者被跳过。
 function admitWaiters(){
  while(waiters.length&&slotsUsed()<capacity){
   const waiter=waiters.shift();
   const conn=connections.get(waiter.connId);
   if(!conn)continue;
   const session=verifySession(waiter.token);
   if(!session){send(conn,{t:'auth-required'});try{conn.ws.close(4003,'auth_required');}catch{}continue;}
   admit(conn,session,actors.get(session.user.id));
  }
  broadcastQueue();
 }
 function broadcastQueue(){
  waiters.forEach((w,i)=>{
   const conn=connections.get(w.connId);
   if(conn)send(conn,{t:'queue-position',position:i+1,waiting:waiters.length});
  });
 }
 function connect(ws){
  const conn={connId:++nextConn,ws,userId:null};
  connections.set(conn.connId,conn);
  ws.on('message',raw=>handleMessage(conn.connId,String(raw)));
  ws.on('close',()=>{
   connections.delete(conn.connId);
   // 排队中的连接断开：移出队列并重新广播位置。
   const at=waiters.findIndex(w=>w.connId===conn.connId);
   if(at>=0){waiters.splice(at,1);broadcastQueue();}
   const actor=conn.userId?actors.get(conn.userId):null;
   if(actor&&actor.conn===conn.connId){
    actor.online=false;actor.conn=null;actor.path=[];actor.lastSeen=now();actor.reclaimUntil=now()+reclaimWindowMs;
    if(actor.seat){actor.seat=null;setTimeout(()=>broadcast({t:'seats',seats:seatOccupancy()}),0);}
    if(actor.chatWith)endConversation(actor.id,'disconnect');
    for(const key of [...aiHistory.keys()])if(key.startsWith(actor.id+':'))aiHistory.delete(key);
    broadcast({t:'snapshot',actors:snapshot()});
    // 名额在 reclaim 窗口内保留给重连；窗口过后由 tick 中的 admitWaiters 补位。
   }
  });
  return conn;
 }
 function tick(dt){
  expireInvites();
  for(const actor of actors.values()){
   if(!actor.online)continue;
   stepActor(actor,dt,3.2);
   if(actor.path.length)actor.state='正在前往';
   else if(actor.state==='正在前往')actor.state='自在漫游';
  }
  // 断线超过宽限期的身份清理，重连需重新入场。
  for(const [userId,actor] of [...actors])if(!actor.online&&now()-actor.lastSeen>RECONNECT_GRACE_MS)actors.delete(userId);
  if(waiters.length)admitWaiters(); // 宽限期清理后可能出现空位
  // AI 运行时：有真人在场才推进（无人休眠）；发布状态变化时刷新观展目标。
  worksChecked+=dt;
  if(worksChecked>2){worksChecked=0;const version=getStateVersion();if(version!==worksVersion){worksVersion=version;engine.setWorks(livePublishedWorks());}}
  if(humansOnline()>0){engine.tick(dt);aiSeatTick();}
  broadcast({t:'snapshot',actors:snapshot(),seats:seatOccupancy()});
  // 约每秒推送一次最近公开活动（行走/社交/观展），侧栏"江湖此刻"使用。
  activityClock+=dt;
  if(activityClock>1){activityClock=0;if(activity.length)broadcast({t:'activity',events:activity.slice(-6)});}
 }
 function attach(httpServer,path='/ws/world',{allowedOrigins=[]}={}){
  // noServer 模式：只处理本世界的升级请求，其余（如 Vite HMR）交给既有监听者。
  const wss=new WebSocketServer({noServer:true});
  httpServer.on('upgrade',(req,socket,head)=>{
   const pathname=String(req.url||'').split('?')[0];
   if(pathname!==path)return;
   if(!originAllowed(req,allowedOrigins)){socket.destroy();return;}
   wss.handleUpgrade(req,socket,head,ws=>connect(ws));
  });
  return wss;
 }
 // 被枢纽踢出（账号去了其他房间）：通知并关闭控制连接。
 function kick(userId,reason='kicked'){
  const actor=actors.get(userId);
  if(!actor?.online||actor.conn==null)return false;
  const conn=connections.get(actor.conn);
  if(conn){send(conn,{t:'kicked',reason});try{conn.ws.close(4004,String(reason));}catch{}}
  return true;
 }
 return {connect,tick,attach,snapshot,handleMessage,actors,connections,capacity,engine,activity,waiters,kick};
}
