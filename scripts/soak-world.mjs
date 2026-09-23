// soak 压测（缩放版首轮证据）：对生产服务施加持续负载并测量关键指标。
//   node scripts/soak-world.mjs                  # 默认 5 分钟、16 位模拟玩家、2 房间
//   ATOM_SOAK_MINUTES=15 ATOM_SOAK_PLAYERS=24 node scripts/soak-world.mjs
//   ATOM_SOAK_MINUTES=120 ATOM_SOAK_PLAYERS=20 ATOM_SOAK_SINGLE_ROOM=1 node scripts/soak-world.mjs  # 长时/单房容量
// 模拟玩家行为：随机点击移动、一对一邀请与私聊（自动接受）、随机断线重连、满员时排队；
// 茶楼共坐（阶段 29 起）：走到茶楼、占空位入座、坐 15—30 秒、起身，偶尔邀请同桌（AI 侠客也会落座）。
// 测量：每位玩家的快照间隔（服务端广播节奏）、协议/页面错误、服务进程内存增长、房间占用。
// 座位不变量：同一座位不出现两个占用者；入座拒绝原因只允许 occupied/far/already；就座期间服务端位置锁定。
// 内联最小 WS 客户端：直接测协议，不依赖应用构建（生产服务只提供 dist/）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {SEATS} from '../src/world/config.js';

const PORT=Number(process.env.ATOM_SOAK_PORT)||5195;
const MINUTES=Math.max(1,Number(process.env.ATOM_SOAK_MINUTES)||5);
const PLAYERS=Math.max(2,Number(process.env.ATOM_SOAK_PLAYERS)||16);
const DURATION_MS=MINUTES*60000;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-soak-'));
// ATOM_SOAK_SINGLE_ROOM=1 时全部玩家进主镇（容量 20），用于 20 人房间容量压测（含排队）。
const singleRoom=process.env.ATOM_SOAK_SINGLE_ROOM==='1';
const roomEnv=singleRoom
 ?{ATOM_ROOM_CAPACITY:'20',ATOM_RECLAIM_WINDOW_MS:'8000',ATOM_DATA_DIR:tmp}
 :{ATOM_ROOMS:'teahouse:江湖茶楼:6',ATOM_ROOM_CAPACITY:'20',ATOM_RECLAIM_WINDOW_MS:'8000',ATOM_DATA_DIR:tmp};
const base=`http://127.0.0.1:${PORT}`;
const server=spawn('node',['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',...roomEnv},stdio:'pipe'});
// 端口被历史残留占用时，本次 spawn 的服务端会启动即退——必须快速失败，
// 否则 waitReady 会打到旧服务上，测的不是本轮代码（曾因此丢掉内存指标）。
let serverExited=null;
server.on('exit',(code,signal)=>{serverExited=`code=${code} signal=${signal}`;});
const waitReady=async()=>{
 for(let i=0;i<60;i++){
  if(serverExited)throw new Error(`服务端进程退出（${serverExited}）——端口 ${PORT} 可能被占用，请先清理残留进程`);
  try{const r=await fetch(`${base}/api/content/health`);if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw new Error('服务未就绪');
};
const serverRss=()=>{try{
 if(process.platform==='darwin'){const out=execSync(`ps -o rss= -p ${server.pid}`).toString().trim();if(!out)throw new Error('no rss');return Number(out)*1024;}
 return Number(fs.readFileSync(`/proc/${server.pid}/status`,'utf8').match(/VmRSS:\s*(\d+)/)[1])*1024;
}catch{return 0;}};

async function main(){
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 const players=await page.evaluate(async(config)=>{
  const makeClient=(url,room,token,handlers)=>{
   let seq=0;
   const client={ws:null,userId:null,handlers,
    send(m){if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(m));},
    // 单触发重连：已在连接/已连接时直接返回，并显式关闭旧 socket——
    // 否则重连定时器与主循环会各建一条连接，orphan socket 滚雪球直到占满浏览器连接池。
    connect(){
     if(this.ws&&(this.ws.readyState===0||this.ws.readyState===1))return;
     try{this.ws&&this.ws.close();}catch{}
     const ws=new WebSocket(url+'?room='+encodeURIComponent(room));
     this.ws=ws;
     ws.onopen=()=>this.send({t:'hello',token});
     ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.t==='welcome')this.userId=d.you&&d.you.id;this.handlers[d.t]&&this.handlers[d.t](d);};
     ws.onclose=()=>setTimeout(()=>this.connect(),600);
    },
    move(x,z){this.send({t:'move',x:Number(x),z:Number(z),id:'mv'+(seq++)});},
    invite(to){this.send({t:'chat-invite',to,id:'inv'+(seq++)});},
    accept(from,id){this.send({t:'chat-accept',from,id});},
    sit(seat){this.send({t:'sit',seat,id:'st'+(seq++)});},
    stand(){this.send({t:'stand',id:'sd'+(seq++)});},
   };
   client.connect();
   return client;
  };
  const run=Date.now().toString(36);
  const out=[];
  for(let i=0;i<config.count;i++){
   const name=`soak${i}-${run}`;
   const reg=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password:'password123',color:'#427ab5'})});
   const auth=await reg.json();
   const room=config.singleRoom?'jianghu':(i%3===2?'teahouse':'jianghu');
   // 茶楼共坐行为状态：walking→sitting→seated→standing；seats 为最近一次占用广播。
   const holder={name,room,snapIntervals:[],lastSnap:0,moves:0,reconnects:0,client:null,
    seats:[],mySeat:null,seatPhase:'idle',seatSince:0,sitOk:0,sitRejects:[],stands:0,seatedMs:0,seatConflicts:0,restEvents:0,mateInvites:0,lastSeatAct:0};
   holder.client=makeClient(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/world`,room,auth.token,{
    // 重连/接管后服务端已自动离座：本地座位状态复位，避免把旧座位当仍占用。
    'welcome':()=>{holder.mySeat=null;holder.seatPhase='idle';holder.lockedPos=null;},
    'chat-invited':d=>holder.client.accept(d.from,d.id),
    // 座位占用广播：同座双占是服务端绝不允许的状态，逐条校验。
    'seats':d=>{
     const list=d.seats||[];
     const seen=new Set();
     for(const s of list){if(seen.has(s.seat))holder.seatConflicts++;seen.add(s.seat);}
     holder.seats=list;
    },
    'sit-ok':d=>{holder.sitOk++;holder.mySeat=d.seat&&d.seat.id;holder.seatPhase='seated';holder.seatSince=Date.now();},
    'sit-reject':d=>{holder.sitRejects.push(d.reason);holder.seatPhase='idle';},
    'stand-ok':()=>{if(holder.mySeat)holder.seatedMs+=Date.now()-holder.seatSince;holder.mySeat=null;holder.stands++;holder.seatPhase='idle';},
    // 入座/离座/AI 落座都会进活动流。
    'activity':d=>{for(const e of d.events||[])if(e.kind==='rest')holder.restEvents++;},
   });
   out.push(holder);
  }
  window.__soak=out;
  return out.map(p=>({name:p.name,room:p.room}));
 },{count:PLAYERS,singleRoom});
 await page.waitForTimeout(4000);
 await page.evaluate(()=>{
  for(const p of window.__soak){
   const prev=p.client.handlers.snapshot;
   p.client.handlers.snapshot=data=>{
    const now=performance.now();
    if(p.lastSnap)p.snapIntervals.push(now-p.lastSnap);
    p.lastSnap=now;
    // 入座后位置由服务端锁定：就座期间自身坐标不得变化。
    const self=(data.actors||[]).find(a=>a.id===p.client.userId);
    if(p.mySeat&&self){
     if(p.lockedPos&&Math.hypot(self.x-p.lockedPos.x,self.z-p.lockedPos.z)>0.01)p.seatMoves=(p.seatMoves||0)+1;
     p.lockedPos={x:self.x,z:self.z};
    }else p.lockedPos=null;
    prev&&prev(data);
   };
  }
 });
 const connected=await page.evaluate(()=>window.__soak.filter(p=>p.client.ws&&p.client.ws.readyState===1).length);
 const main=players.filter(p=>p.room==='jianghu').length,tea=players.filter(p=>p.room==='teahouse').length;
 console.log(`模拟玩家 ${players.length} 位（主镇 ${main} / 茶楼 ${tea}${tea?'，茶楼容量 6':''}${singleRoom?'，主镇容量 20（超出者排队）':''}），初始已连接 ${connected}`);
 const started=Date.now();
 const rssStart=await serverRss();
 let lastLog=Date.now();
 const writeReport=async(rssEnd)=>{
  const clientStats=await page.evaluate(()=>{
   const all=window.__soak.flatMap(p=>p.snapIntervals).sort((a,b)=>a-b);
   return {
    snapshotSamples:all.length,
    snapshotIntervalMs:{p50:+(all[Math.floor(all.length*0.5)]||0).toFixed(1),p95:+(all[Math.floor(all.length*0.95)]||0).toFixed(1),max:+(all[all.length-1]||0).toFixed(1)},
    movesSent:window.__soak.reduce((s,p)=>s+p.moves,0),
    reconnects:window.__soak.reduce((s,p)=>s+p.reconnects,0),
    connected:window.__soak.filter(p=>p.client.ws&&p.client.ws.readyState===1).length,
    // 茶楼共坐：入座/拒绝/起身/就座时长/同座双占/就座位移/活动流事件/同桌相邀。
    seats:{
     sitOk:window.__soak.reduce((s,p)=>s+p.sitOk,0),
     sitRejects:window.__soak.reduce((s,p)=>s+p.sitRejects.length,0),
     rejectReasons:[...new Set(window.__soak.flatMap(p=>p.sitRejects))],
     stands:window.__soak.reduce((s,p)=>s+p.stands,0),
     seatedMinutes:+((window.__soak.reduce((s,p)=>s+p.seatedMs+(p.mySeat?Date.now()-p.seatSince:0),0))/60000).toFixed(1),
     seatConflicts:window.__soak.reduce((s,p)=>s+p.seatConflicts,0),
     seatMoves:window.__soak.reduce((s,p)=>s+(p.seatMoves||0),0),
     restEvents:window.__soak.reduce((s,p)=>s+p.restEvents,0),
     mateInvites:window.__soak.reduce((s,p)=>s+p.mateInvites,0),
     seatedNow:window.__soak.filter(p=>p.mySeat).length,
    },
   };
  }).catch(()=>null);
  const rooms=await (await fetch(`${base}/api/rooms`)).json().catch(()=>({rooms:[]}));
  const report={generatedAt:new Date().toISOString(),durationMinutes:MINUTES,players:PLAYERS,roomConfig:roomEnv.ATOM_ROOMS||'(single)',partial:true,
   server:{rssStartMB:+(rssStart/1048576).toFixed(1),rssEndMB:rssEnd?+(rssEnd/1048576).toFixed(1):null},
   world:{occupancy:rooms.rooms},client:clientStats,pageErrors:[]};
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/soak-report.json',JSON.stringify(report,null,2));
 };
 const loop=setInterval(async()=>{
  await page.evaluate(seatIds=>{
   for(const p of window.__soak){
    const ws=p.client.ws;
    if(!ws||ws.readyState!==1){if(Math.random()<0.3){p.client.connect();p.reconnects++;}continue;}
    // 茶楼共坐行为：周期性 走到茶楼 → 占空位入座 → 坐 15—30 秒 → 起身（AI 侠客也会落座，空位随机变化）。
    if(!p.mySeat&&p.seatPhase==='idle'&&Math.random()<0.02){
     p.seatPhase='walking';p.lastSeatAct=Date.now();p.client.move(-10,-2); // 茶楼入口
    }
    if(p.seatPhase==='walking'&&Date.now()-p.lastSeatAct>4000){
     const taken=new Set(p.seats.map(s=>s.seat));
     const free=seatIds.filter(id=>!taken.has(id));
     if(free.length){p.client.sit(free[Math.floor(Math.random()*free.length)]);p.seatPhase='sitting';p.lastSeatAct=Date.now();}
     else p.seatPhase='idle'; // 满座：稍后再试
    }
    if(p.seatPhase==='sitting'&&Date.now()-p.lastSeatAct>6000)p.seatPhase='idle'; // 被拒/超时兜底
    if(p.mySeat){
     // 就座期间不随机移动（服务端也会拒绝）；偶尔邀请同桌（含 AI 侠客）。
     if(Math.random()<0.05){
      const table=p.mySeat.slice(0,5);
      const mate=p.seats.find(s=>s.seat!==p.mySeat&&s.seat.slice(0,5)===table&&s.userId!==p.client.userId);
      if(mate){p.client.invite(mate.userId);p.mateInvites++;}
     }
     if(Date.now()-p.seatSince>15000+Math.random()*15000){p.client.stand();p.seatPhase='standing';}
    }else if(Math.random()<0.5){p.client.move((Math.random()*32-16).toFixed(1),(Math.random()*24-12).toFixed(1));p.moves++;}
    if(Math.random()<0.04){
     const other=window.__soak[Math.floor(Math.random()*window.__soak.length)];
     if(other!==p&&other.client.userId)p.client.invite(other.client.userId);
    }
    if(Math.random()<0.008){ws.close();p.reconnects++;}
   }
  },SEATS.map(s=>s.id));
  if(Date.now()-lastLog>30000){
   lastLog=Date.now();
   const rooms=await (await fetch(`${base}/api/rooms`)).json();
   const seatNow=await page.evaluate(()=>window.__soak.filter(p=>p.mySeat).length).catch(()=>0);
   console.log(`t+${((Date.now()-started)/1000).toFixed(0)}s · ${rooms.rooms.map(r=>`${r.id}:${r.online}人在线${r.waiting?`/${r.waiting}排队`:''}`).join(' · ')} · 在座 ${seatNow} · RSS ${(serverRss()/1048576).toFixed(0)}MB`);
   await writeReport(null); // 增量写入：长时运行中崩溃也不丢数据
  }
 },1000);
 await new Promise(r=>setTimeout(r,DURATION_MS));
 clearInterval(loop);
 const rssEnd=await serverRss();
 const clientStats=await page.evaluate(()=>{
  const all=window.__soak.flatMap(p=>p.snapIntervals).sort((a,b)=>a-b);
  return {
   snapshotSamples:all.length,
   snapshotIntervalMs:{p50:+(all[Math.floor(all.length*0.5)]||0).toFixed(1),p95:+(all[Math.floor(all.length*0.95)]||0).toFixed(1),max:+(all[all.length-1]||0).toFixed(1)},
   movesSent:window.__soak.reduce((s,p)=>s+p.moves,0),
   reconnects:window.__soak.reduce((s,p)=>s+p.reconnects,0),
   connected:window.__soak.filter(p=>p.client.ws&&p.client.ws.readyState===1).length,
   // 茶楼共坐：入座/拒绝/起身/就座时长/同座双占/就座位移/活动流事件/同桌相邀。
   seats:{
    sitOk:window.__soak.reduce((s,p)=>s+p.sitOk,0),
    sitRejects:window.__soak.reduce((s,p)=>s+p.sitRejects.length,0),
    rejectReasons:[...new Set(window.__soak.flatMap(p=>p.sitRejects))],
    stands:window.__soak.reduce((s,p)=>s+p.stands,0),
    seatedMinutes:+((window.__soak.reduce((s,p)=>s+p.seatedMs+(p.mySeat?Date.now()-p.seatSince:0),0))/60000).toFixed(1),
    seatConflicts:window.__soak.reduce((s,p)=>s+p.seatConflicts,0),
    seatMoves:window.__soak.reduce((s,p)=>s+(p.seatMoves||0),0),
    restEvents:window.__soak.reduce((s,p)=>s+p.restEvents,0),
    mateInvites:window.__soak.reduce((s,p)=>s+p.mateInvites,0),
    seatedNow:window.__soak.filter(p=>p.mySeat).length,
   },
  };
 });
 const rooms=await (await fetch(`${base}/api/rooms`)).json();
 const report={
  generatedAt:new Date().toISOString(),durationMinutes:MINUTES,players:PLAYERS,roomConfig:roomEnv.ATOM_ROOMS,
  server:{rssStartMB:+(rssStart/1048576).toFixed(1),rssEndMB:+(rssEnd/1048576).toFixed(1),rssGrowthMB:+((rssEnd-rssStart)/1048576).toFixed(1)},
  world:{occupancy:rooms.rooms},
  client:clientStats,
  pageErrors:pageErrors.slice(0,10),
 };
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/soak-report.json',JSON.stringify(report,null,2));
 console.log('--- soak 报告（已写入 artifacts/soak-report.json）---');
 console.log(JSON.stringify(report,null,2));
 await browser.close();
 assert.equal(pageErrors.length,0,`页面错误: ${pageErrors.slice(0,3).join('; ')}`);
 assert.ok(clientStats.snapshotSamples>DURATION_MS/50,`快照样本不足: ${clientStats.snapshotSamples}`);
 assert.ok(clientStats.snapshotIntervalMs.p95<500,`快照 p95 ${clientStats.snapshotIntervalMs.p95}ms 过慢`);
 assert.ok(report.server.rssGrowthMB<300,`内存增长 ${report.server.rssGrowthMB}MB 超限`);
 assert.ok(report.server.rssEndMB>0,`内存采样失败（rssEnd=${report.server.rssEndMB}MB）——服务端进程可能未启动，不能默认通过`);
 // 茶楼共坐不变量：同座不双占、就座位置锁定、拒绝原因合法、共坐行为真实发生。
 const seats=clientStats.seats;
 assert.equal(seats.seatConflicts,0,`同一座位出现两个占用者（${seats.seatConflicts} 次）`);
 assert.equal(seats.seatMoves,0,`就座期间位置未被锁定（${seats.seatMoves} 次偏移）`);
 assert.ok(seats.sitOk>0,`没有玩家成功入座：${JSON.stringify(seats)}`);
 assert.ok(seats.rejectReasons.every(r=>['occupied','far','already'].includes(r)),`非法入座拒绝原因: ${seats.rejectReasons.join(',')}`);
 console.log(`PASS: soak 完成——无页面错误，快照 p95 ${clientStats.snapshotIntervalMs.p95}ms，内存增长 ${report.server.rssGrowthMB}MB；茶楼共坐 ${seats.sitOk} 次入座 / ${seats.stands} 次起身 / 同桌相邀 ${seats.mateInvites} 次 / 入座事件 ${seats.restEvents} 条，座位不变量零违例。`);
}
try{await main();}finally{server.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true});}
