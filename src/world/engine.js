import {PLACES,AGENTS} from './config.js';
// 时辰节律：一天 24 小时映射为 36 分钟真实时间（1 游戏小时 = 90 秒）。
// AI 按时辰偏好选择去处：清晨茶楼与工坊、上午看展与茶楼、午后书院也到茶楼歇脚、
// 傍晚亭台与工坊、入夜展会与茶楼、深夜早歇。茶楼是社交中枢，全天都可能有侠客落座。
export const DAY_PHASES=[
 {name:'清晨',from:6,to:9,prefer:['tea','workshop'],pace:1},
 {name:'上午',from:9,to:12,prefer:['tea','workshop','hall'],pace:1},
 {name:'午后',from:12,to:14,prefer:['hall','library','tea'],pace:1},
 {name:'傍晚',from:14,to:18,prefer:['agora','library','workshop','tea'],pace:1.15},
 {name:'入夜',from:18,to:22,prefer:['hall','agora','tea'],pace:1.3},
 {name:'深夜',from:22,to:6,prefer:['agora','tea'],pace:2},
];
// 论剑（Agent 与 Agent 的公开辩论）：定时双侠到群侠论剑台就一个话题各执一词，
// 议题来自社区真话题与角色见闻；玩家可到场旁观。与私聊的区别是「公开、有立场、有观众」。
export const DEBATE_TOPICS=[
 {topic:'想法该先做出来还是先想清楚',pro:'先做出来，跑起来才知道对不对',con:'先想清楚骨架，不然返工更贵'},
 {topic:'分享要等作品完美再发吗',pro:'半成品也值得发，反馈就是养料',con:'至少自己这关过了再给人看'},
 {topic:'小队里先定目标还是先定节奏',pro:'目标不清，节奏再好也白跑',con:'节奏稳了，目标自然清晰'},
 {topic:'AI 该替人做事还是陪人想事',pro:'能接手的杂事就放心交给它',con:'关键的那步必须人来判断'},
 {topic:'新手先深耕一个方向还是多试几个',pro:'先打透一个点，信心是攒出来的',con:'多试几个才找得到真正的兴趣'},
];
// 站位取论剑台外圈可走点（台体 6×6 会挡路）：南北两侧各两个，隔着高台相对而辩。
const AGORA_SPOTS=[{x:11.2,z:6.2},{x:12.8,z:13.7},{x:12.8,z:6.2},{x:11.2,z:13.7}];
export function agoraSpots(){return AGORA_SPOTS;}
// 取两个空闲且互不为伴的侠客；不足则本轮不办。
export function pickDebatePair(agents){
 const free=agents.filter(a=>!a.held&&!a.partner&&!a.path.length&&!a.debating&&!a.seat);
 if(free.length<2)return null;
 const a=free[Math.floor(Math.random()*free.length)];
 const b=free.find(x=>x.id!==a.id&&x.id!==a.partner);
 return b?[a,b]:null;
}
export function phaseAt(hour){
 for(const p of DAY_PHASES){if(p.from<p.to){if(hour>=p.from&&hour<p.to)return p;}else if(hour>=p.from||hour<p.to)return p;}
 return DAY_PHASES[0];
}
// 观展兴趣：角色优先读取与职责相关的赛道；点灯人与守馆人没有偏好。
const INTERESTS={shouguan:null,ayuan:null,qinghe:['电商出海'],moyu:['内容创作'],xingzhou:['效率工具'],xiaoman:['效率工具','智慧学务'],zhaolu:['生活成长'],xinghe:['智慧学务','空间预约']};
// 观感只表达角色看法；事实一律取自作品结构化字段，不生成奖项、名次或效果承诺。
const OPINIONS={shouguan:'这个问题选得具体，值得细看',qinghe:'瞄准真实需求，有做成小生意的潜质',moyu:'这个思路值得记进素材本',xingzhou:'从能跑起来的原型做起，很务实',xiaoman:'经验很开放，适合拆开来学习',zhaolu:'小改进也能有大改变',xinghe:'一群人一起磨出来，真好',ayuan:'新朋友的手艺，欢迎来馆里看看'};
export function impressionOf(agent,work){
 const fact=String(work.tagline||'').replace(/[。！？.!?]+$/,'');
 const short=fact.length>16?fact.slice(0,16)+'…':fact;
 const opinion=OPINIONS[agent.id]||'值得细细了解';
 return {impression:`《${work.title}》：“${short}”。${opinion}。`.slice(0,60),opinion};
}
export function walkable(x,z){
 if(x < -18 || x >18 || z < -14 || z >14) return false;
 if(z>=4&&z<=6 && !(x>=-5&&x<=-3) && !(x>=9&&x<=11))return false;
 return !PLACES.some(p=>Math.abs(x-p.x)<p.w/2+.6&&Math.abs(z-p.z)<p.d/2+.6);
}
export function nearestWalkable(x,z,isWalkable=walkable){
 x=Math.max(-18,Math.min(18,Math.round(x)));z=Math.max(-14,Math.min(14,Math.round(z)));
 for(let r=0;r<40;r++)for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(Math.abs(a)===r||Math.abs(b)===r)if(isWalkable(x+a,z+b))return [x+a,z+b];
 return [-2,0];
}
export function findPath(from,to,isWalkable=walkable){
 const start=nearestWalkable(...from,isWalkable),end=nearestWalkable(...to,isWalkable),key=p=>p.join(','),s=key(start),goal=key(end);
 const open=[start],seen=new Set([s]),previous=new Map();let found=false;
 while(open.length){const p=open.shift(),k=key(p);if(k===goal){found=true;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[p[0]+dx,p[1]+dz],nk=key(n);if(!seen.has(nk)&&isWalkable(...n)){seen.add(nk);previous.set(nk,k);open.push(n);}}
 }
 if(!found)return [];
 let at=goal,result=[];while(at!==s){result.unshift(at.split(',').map(Number));at=previous.get(at);}return result;
}
export class WorldEngine{
 constructor(onEvent=()=>{}){this.time=0;this.onEvent=onEvent;this.paused=false;this.clock=8;this.lastPhase=phaseAt(this.clock).name;this.player={id:'you',name:'你',color:'#427ab5',x:-3,z:1,angle:0,path:[],state:'自在漫游'};this.agents=AGENTS.map((a,i)=>({...a,x:a.start[0],z:a.start[1],angle:0,path:[],state:'歇脚中',wait:2+i*1.7,step:i%2,memory:[],partner:null,task:null,views:[],viewed:new Set(),lastView:-999,debating:null,debateTopic:null}));this.works=[];this.debateCooldown=20;this.debateRound=0;this.weather='clear';}
 phase(){return phaseAt(this.clock);}
 // 已发布作品由内容契约注入；观展与导览只读取发布状态为“已发布”的数据。
 setWorks(works){this.works=Array.isArray(works)?works.filter(w=>w&&w.id&&w.title&&w.publicationStatus==='已发布'):[];}
 pickWork(a){
  const pref=INTERESTS[a.id];
  const pool=pref?this.works.filter(w=>pref.includes(w.track)):this.works;
  const fresh=pool.filter(w=>!a.viewed.has(w.id));
  const list=fresh.length?fresh:pool;
  if(!list.length)return null;
  return list[Math.floor(this.time*3+a.step)%list.length];
 }
 movePlayer(x,z){this.player.path=findPath([this.player.x,this.player.z],[x,z]);this.player.state=this.player.path.length?'正在前往':'自在漫游';return this.player.path.length>0;}
 hold(id){this.agents.forEach(a=>{if(a.id===id||a.partner===id){a.partner=null;a.wait=8;a.state='歇脚中';a.task=null;}});const a=this.agents.find(a=>a.id===id);if(a){a.path=[];a.held=true;a.state='与你交谈';}}
 release(id){const a=this.agents.find(a=>a.id===id);if(a){a.held=false;a.wait=6;a.state='歇脚中';}}
 tick(dt){if(this.paused)return;dt=Math.min(dt,.1);this.time+=dt;this.clock=(this.clock+dt/90)%24;
  const phase=phaseAt(this.clock);
  if(phase.name!==this.lastPhase){this.lastPhase=phase.name;this.onEvent({id:`phase-${this.time}`,text:`时辰流转，江湖到了${phase.name}`,kind:'phase',time:Date.now()});}
  this.runDebate(dt);
  this.advance(this.player,dt,this.raining?2:3.2);
  for(const a of this.agents){if(a.held)continue;this.advance(a,dt,this.raining?.75:1.15);if(a.path.length)continue;
   // 观展闭环：到达展示馆后读取作品事实，生成不超过 60 字的角色观感并记入公开见闻。
   if(a.task?.type==='observe'&&!a.task.done){
    a.task.done=true;const w=a.task.work,{impression,opinion}=impressionOf(a,w);
    a.viewed.add(w.id);a.lastView=this.time;
    a.views.unshift({workId:w.id,title:w.title,tagline:w.tagline||'',impression,opinion,time:this.time});a.views=a.views.slice(0,6);
    a.memory.push(impression);a.memory=a.memory.slice(-20);
    a.state='观展中';a.wait=20+(a.step%5)*4;
    this.onEvent({id:`view-${a.id}-${this.time}`,text:impression,kind:'view',time:Date.now()});
    continue;
   }
   if(a.task)a.task=null;
   a.wait-=dt;if(a.wait>0)continue;
   if(a.partner){a.partner=null;a.state='整理见闻';a.wait=6;continue;}
   const other=this.agents.find(b=>b.id!==a.id&&!b.held&&!b.path.length&&!b.partner&&!b.seat&&b.wait>0&&Math.hypot(b.x-a.x,b.z-a.z)<3);
   if(other&&a.state!=='整理见闻'){a.partner=other.id;other.partner=a.id;a.state=`与${other.name}闲聊`;other.state=`与${a.name}闲聊`;a.wait=9;other.wait=9;a.angle=Math.atan2(other.x-a.x,other.z-a.z);other.angle=a.angle+Math.PI;
    // 话题可以来自一方最近的观展见闻，让 AI 的交流与真实作品自然相连。
    const seen=[a,other].map(x=>x.views[0]).find(Boolean);
    const topic=seen&&a.step%2===0?`在展示馆看到的《${seen.title}》`:['开源分享','最近看到的作品','如何把想法做成原型'][Math.floor(this.time)%3];
    const text=`${a.name}与${other.name}聊起了${topic}`;
    a.memory.push(text);other.memory.push(text);a.memory=a.memory.slice(-20);other.memory=other.memory.slice(-20);this.onEvent({id:`${a.id}-${this.time}`,text,kind:'chat',time:Date.now()});continue;}
   // 计划一次观展：带目标作品前往展示馆；同一作品一个会话内只生成一次观感。
   if(this.works.length&&!a.partner&&this.time-a.lastView>150&&a.step%3===0){
    const w=this.pickWork(a);
    if(w){const dest=PLACES.find(p=>p.id==='hall');a.path=findPath([a.x,a.z],dest.entry);a.task={type:'observe',work:w,done:false};a.state='前往展示馆';a.wait=8;this.onEvent({id:`plan-${a.id}-${this.time}`,text:`${a.name}动身前往展示馆，想看看《${w.title}》`,kind:'walk',time:Date.now()});continue;}
   }
   const phaseNow=phaseAt(this.clock);
   const preferred=a.places.filter(id=>{const p=PLACES.find(p=>p.id===id);return p&&phaseNow.prefer.includes(p.kind)});
   const destinationId=preferred.length?preferred[a.step++%preferred.length]:a.places[a.step++%a.places.length];
   const dest=PLACES.find(p=>p.id===destinationId);a.path=findPath([a.x,a.z],dest.entry);a.state=`前往${dest.short}`;a.wait=(7+(a.step%5))*phaseNow.pace*(this.raining?1.35:1);this.onEvent({id:`${a.id}-${this.time}`,text:`${a.name}动身前往${dest.short}`,kind:'walk',time:Date.now()});
  }
 }
 advance(a,dt,speed){stepActor(a,dt,speed);}
 // 群侠论剑台：定时双侠上台就一个话题各执一词（公开、有立场、可旁观）。
 runDebate(dt){
  this.debateCooldown-=dt;
  if(this.debateCooldown<=0&&!this.agents.some(a=>a.debating)){
   this.debateCooldown=45+Math.random()*35;
   const pair=pickDebatePair(this.agents);
   if(!pair)return;
   const t=DEBATE_TOPICS[this.debateRound++%DEBATE_TOPICS.length],[p0,p1]=pair;
   for(const [a,other,spot,side] of [[p0,p1,AGORA_SPOTS[0],0],[p1,p0,AGORA_SPOTS[1],1]]){
    a.debating={topic:t.topic,side,with:other.id};a.debateTopic=t.topic;
    a.partner=other.id;other.partner=a.id;
    a.state='前往论剑台';other.state='前往论剑台';
    a.path=findPath([a.x,a.z],[spot.x,spot.z]);
    other.path=findPath([other.x,other.z],[AGORA_SPOTS[side?0:1].x,AGORA_SPOTS[side?0:1].z]);
    a.debateUntil=this.time+50;other.debateUntil=this.time+50;
    a.holdAt=spot;other.holdAt=AGORA_SPOTS[side?0:1];
   }
   this.onEvent({id:`debate-${this.time}`,text:`${p0.name}与${p1.name}约在论剑台，就「${t.topic}」各执一词`,kind:'debate',time:Date.now()});
  }
  for(const a of this.agents){
   if(!a.debating||a.path.length)continue;
   if(a.debating.until===undefined)a.debating.until=a.debateUntil;
   if(this.time>a.debating.until){this.endDebate(a);continue;}
   if(a.holdAt){a.x=a.holdAt.x;a.z=a.holdAt.z;a.holdAt=null;}
   const other=this.agents.find(b=>b.id===a.debating.with);
   if(other)a.angle=Math.atan2(other.x-a.x,other.z-a.z);
   a.state='论剑中';a.wait=3;
   if(this.time-(a.lastSpeak||0)>7){
    a.lastSpeak=this.time;
    const t=DEBATE_TOPICS.find(x=>x.topic===a.debating.topic)||DEBATE_TOPICS[0];
    const line=a.debating.side?t.con:t.pro;
    a.debateSpeak=line;   // 3D 气泡读这句：让旁观的人也看见双方论点
    this.onEvent({id:`debate-say-${a.id}-${this.time}`,text:`${a.name}：“${line}”`,kind:'debate',time:Date.now()});
   }
  }
 }
 endDebate(a){
  const other=this.agents.find(b=>b.id===a.debating?.with);
  for(const x of [a,other].filter(Boolean)){
   x.debating=null;x.debateTopic=null;x.holdAt=null;
   x.partner=null;x.state='整理见闻';x.wait=8;
  }
 }

// 玩家加入论剑：选一边，台上两位当场就这一边回应（公开，旁观者可见）。
 joinDebate(side){
  const pair=this.agents.filter(a=>a.debating);
  if(pair.length<2)return false;
  const t=DEBATE_TOPICS.find(x=>x.topic===pair[0].debating.topic)||DEBATE_TOPICS[0];
  const mine=side?t.con:t.pro,theirs=side?t.pro:t.con;
  const [a,b]=pair;
  a.debateSpeak=mine;b.debateSpeak=theirs;
  a.lastSpeak=this.time;b.lastSpeak=this.time-.05;
  a.respondToPlayer=side;b.respondToPlayer=side;
  this.onEvent({id:`debate-join-${this.time}`,text:`你加入论剑，站在「${mine}」一边，${a.name}与${b.name}各自回应`,kind:'debate',time:Date.now()});
  return true;
 }
 hasDebate(){return this.agents.some(a=>a.debating);}
 // 天气只影响节奏：微雨时侠客走慢一点、行程间隔长一点（雨景是氛围，不是惩罚）。
 setWeather(w){this.weather=w==='rain'?'rain':'clear';}
 get raining(){return this.weather==='rain';}
 debatePro(topic){const t=DEBATE_TOPICS.find(x=>x.topic===topic);return t?t.pro:'我看值得一试';}
 debateCon(topic){const t=DEBATE_TOPICS.find(x=>x.topic===topic);return t?t.con:'也要留个后手';}
 snapshot(){return this.agents.map(({id,name,state,x,z,memory,views})=>({id,name,state,x,z,memory:[...memory],views:views.map(v=>({...v}))}));}
}
// 沿路径推进一个角色（服务端权威移动与客户端预测共用同一套规则）。
export function stepActor(a,dt,speed){if(!a.path.length)return;const p=a.path[0],dx=p[0]-a.x,dz=p[1]-a.z,d=Math.hypot(dx,dz);a.angle=Math.atan2(dx,dz);if(d<speed*dt){a.x=p[0];a.z=p[1];a.path.shift();if(!a.path.length)a.state=a.id==='you'?'自在漫游':'看展与歇脚';}else{a.x+=dx/d*speed*dt;a.z+=dz/d*speed*dt;}}

export function hallWalkable(x,z){return Math.abs(x)<=10&&Math.abs(z)<=8&&![-6.75,-2.25,2.25,6.75].some(a=>[-5,3].some(b=>Math.abs(x-a)<1.5&&Math.abs(z-b)<1.2));}

export function terrainHeight(x,z){if(z>=2.7&&z<=7.32&&[-4,10].some(b=>Math.abs(x-b)<=1.15)){const t=(z-2.7)/4.62;return .27+Math.sin(t*Math.PI)*.55;}return 0;}
