// 联机客户端：连接服务端权威世界，发送移动与聊天指令，接收快照与私聊。
// 断线后用同一身份自动重连（服务端保留 60 秒宽限期）；被同账号新会话接管时明确提示。
// 身份由服务端会话令牌决定（hello 携带 token，客户端传入的 userId 一律无效）。
export class OnlineClient{
 constructor({url,token,room='jianghu',handlers={}}){
  // 房间通过查询参数路由到对应的权威世界。
  const separator=url.includes('?')?'&':'?';
  this.url=url+separator+'room='+encodeURIComponent(room);
  this.room=room;this.token=token;this.handlers=handlers;
  this.ws=null;this.connected=false;this.closedByUser=false;this.retry=0;this.seq=0;this.userId=null;
 }
 connect(){
  this.closedByUser=false;
  try{this.ws=new WebSocket(this.url);}catch{this.scheduleReconnect();return;}
  this.ws.onopen=()=>{this.retry=0;this.connected=true;this.handlers.onOpen?.();this.send({t:'hello',token:this.token});};
  this.ws.onclose=()=>{
   this.connected=false;this.handlers.onClose?.();
   // taken-over 由服务端明确通知，不自动重连抢回控制权。
   if(!this.closedByUser&&!this.takenOver)this.scheduleReconnect();
  };
  this.ws.onerror=()=>{};
  this.ws.onmessage=event=>{
   let data;try{data=JSON.parse(event.data);}catch{return;}
   this.handle(data);
  };
 }
 scheduleReconnect(){
  if(this.closedByUser)return;
  const delay=Math.min(1000*2**this.retry++,10000);
  setTimeout(()=>{if(!this.closedByUser)this.connect();},delay);
 }
 handle(data){
  switch(data.t){
   case 'welcome':this.userId=data.you?.id||null;this.handlers.onWelcome?.(data);break;
   case 'snapshot':this.handlers.onSnapshot?.(data);break;
   case 'activity':this.handlers.onActivity?.(data);break;
   case 'presence':this.handlers.onPresence?.(data);break;
   case 'profile':this.handlers.onProfile?.(data);break;
   case 'auth-required':this.handlers.onAuthRequired?.(data);break;
   case 'room-queued':this.handlers.onRoomQueued?.(data);break;
   case 'emote':this.handlers.onEmote?.(data);break;
   case 'seats':this.handlers.onSeats?.(data);break;
   case 'sit-ok':this.handlers.onSitOk?.(data);break;
   case 'sit-reject':this.handlers.onSitReject?.(data);break;
   case 'stand-ok':this.handlers.onStandOk?.(data);break;
   case 'queue-position':this.handlers.onQueuePosition?.(data);break;
   case 'queue-left':this.handlers.onQueueLeft?.(data);break;
   case 'move-ok':this.handlers.onMoveOk?.(data);break;
   case 'move-reject':this.handlers.onMoveReject?.(data);break;
   case 'chat-invited':this.handlers.onChatInvited?.(data);break;
   case 'invite-sent':this.handlers.onInviteSent?.(data);break;
   case 'invite-failed':this.handlers.onInviteFailed?.(data);break;
   case 'invite-expired':this.handlers.onInviteExpired?.(data);break;
   case 'chat-start':this.handlers.onChatStart?.(data);break;
   case 'chat-msg':this.handlers.onChatMsg?.(data);break;
   case 'chat-ack':this.handlers.onChatAck?.(data);break;
   case 'chat-end':this.handlers.onChatEnd?.(data);break;
   case 'chat-rejected':this.handlers.onChatRejected?.(data);break;
   case 'chat-error':this.handlers.onChatError?.(data);break;
   case 'blocked':this.handlers.onBlocked?.(data);break;
   case 'taken-over':this.takenOver=true;this.handlers.onTakenOver?.(data);break;
   case 'room-full':this.handlers.onRoomFull?.(data);break;
   case 'error':this.handlers.onError?.(data);break;
  }
 }
 send(message){
  if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(message));
 }
 nextId(prefix){return `${prefix}-${Date.now().toString(36)}-${(this.seq++).toString(36)}`;}
 move(x,z){const id=this.nextId('mv');this.send({t:'move',x,z,id});return id;}
 invite(userId){const id=this.nextId('inv');this.send({t:'chat-invite',to:userId,id});return id;}
 accept(from,id){this.send({t:'chat-accept',from,id});}
 reject(from,id){this.send({t:'chat-reject',from,id});}
 sendMsg(to,text){const id=this.nextId('msg');this.send({t:'chat-send',to,id,text});return id;}
 leave(){this.send({t:'chat-leave'});}
 block(userId){this.send({t:'block',userId});}
 // 公开表情招呼（附近玩家可见 3 秒，服务端限速）。
 emote(kind='wave'){this.send({t:'emote',emote:kind});}
 // 茶楼共坐：入座/起身（服务端锁定位置）。
 sit(seatId){const id=this.nextId('sit');this.send({t:'sit',seat:seatId,id});return id;}
 stand(){this.send({t:'stand'});}
 // 取消排队（房间满员等待中）。
 leaveQueue(){this.send({t:'leave-queue'});}
 // 名帖在账号体系修改后，用同一令牌同步房间内的显示。
 syncProfile(token){this.send({t:'profile',token:token||this.token});}
 close(){this.closedByUser=true;this.takenOver=false;try{this.ws?.close();}catch{}}
}
