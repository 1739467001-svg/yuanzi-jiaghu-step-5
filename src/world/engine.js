import {PLACES,AGENTS} from './config.js';
// 时辰节律：一天 24 小时映射为 36 分钟真实时间（1 游戏小时 = 90 秒）。
// AI 按时辰偏好选择去处：清晨茶楼与工坊、上午看展与茶楼、午后书院也到茶楼歇脚、
// 傍晚亭台与工坊、入夜展会与茶楼、深夜早歇。茶楼是社交中枢，全天都可能有侠客落座。
export const DAY_PHASES=[
 {name:'清晨',from:6,to:9,prefer:['tea','workshop'],pace:1},
 {name:'上午',from:9,to:12,prefer:['tea','workshop','hall'],pace:1},
 {name:'午后',from:12,to:14,prefer:['hall','library','tea'],pace:1},
 {name:'傍晚',from:14,to:18,prefer:['pavilion','library','workshop','tea'],pace:1.15},
 {name:'入夜',from:18,to:22,prefer:['hall','pavilion','tea'],pace:1.3},
 {name:'深夜',from:22,to:6,prefer:['pavilion','tea'],pace:2},
];
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
 constructor(onEvent=()=>{}){this.time=0;this.onEvent=onEvent;this.paused=false;this.clock=8;this.lastPhase=phaseAt(this.clock).name;this.player={id:'you',name:'你',color:'#427ab5',x:-3,z:1,angle:0,path:[],state:'自在漫游'};this.agents=AGENTS.map((a,i)=>({...a,x:a.start[0],z:a.start[1],angle:0,path:[],state:'歇脚中',wait:2+i*1.7,step:i%2,memory:[],partner:null,task:null,views:[],viewed:new Set(),lastView:-999}));this.works=[];}
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
  this.advance(this.player,dt,3.2);
  for(const a of this.agents){if(a.held)continue;this.advance(a,dt,1.15);if(a.path.length)continue;
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
   const other=this.agents.find(b=>b.id!==a.id&&!b.held&&!b.path.length&&!b.partner&&b.wait>0&&Math.hypot(b.x-a.x,b.z-a.z)<3);
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
   const dest=PLACES.find(p=>p.id===destinationId);a.path=findPath([a.x,a.z],dest.entry);a.state=`前往${dest.short}`;a.wait=(7+(a.step%5))*phaseNow.pace;this.onEvent({id:`${a.id}-${this.time}`,text:`${a.name}动身前往${dest.short}`,kind:'walk',time:Date.now()});
  }
 }
 advance(a,dt,speed){stepActor(a,dt,speed);}
 snapshot(){return this.agents.map(({id,name,state,x,z,memory,views})=>({id,name,state,x,z,memory:[...memory],views:views.map(v=>({...v}))}));}
}
// 沿路径推进一个角色（服务端权威移动与客户端预测共用同一套规则）。
export function stepActor(a,dt,speed){if(!a.path.length)return;const p=a.path[0],dx=p[0]-a.x,dz=p[1]-a.z,d=Math.hypot(dx,dz);a.angle=Math.atan2(dx,dz);if(d<speed*dt){a.x=p[0];a.z=p[1];a.path.shift();if(!a.path.length)a.state=a.id==='you'?'自在漫游':'看展与歇脚';}else{a.x+=dx/d*speed*dt;a.z+=dz/d*speed*dt;}}

export function hallWalkable(x,z){return Math.abs(x)<=10&&Math.abs(z)<=8&&![-6.75,-2.25,2.25,6.75].some(a=>[-5,3].some(b=>Math.abs(x-a)<1.5&&Math.abs(z-b)<1.2));}

export function terrainHeight(x,z){if(z>=2.7&&z<=7.32&&[-4,10].some(b=>Math.abs(x-b)<=1.15)){const t=(z-2.7)/4.62;return .27+Math.sin(t*Math.PI)*.55;}return 0;}
