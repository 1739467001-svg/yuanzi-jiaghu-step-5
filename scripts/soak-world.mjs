// soak 压测（缩放版首轮证据）：对生产服务施加持续负载并测量关键指标。
//   node scripts/soak-world.mjs                  # 默认 5 分钟、16 位模拟玩家、2 房间
//   ATOM_SOAK_MINUTES=15 ATOM_SOAK_PLAYERS=24 node scripts/soak-world.mjs
// 模拟玩家行为：随机点击移动、一对一邀请与私聊（自动接受）、随机断线重连、满员时排队。
// 测量：每位玩家的快照间隔（服务端广播节奏）、协议/页面错误、服务进程内存增长、房间占用。
// 内联最小 WS 客户端：直接测协议，不依赖应用构建（生产服务只提供 dist/）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execSync} from 'node:child_process';
import {chromium} from '@playwright/test';

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
const waitReady=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(`${base}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('服务未就绪');};
const serverRss=()=>{try{
 if(process.platform==='darwin')return Number(execSync(`ps -o rss= -p ${server.pid}`).toString().trim())*1024;
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
    connect(){
     const ws=new WebSocket(url+'?room='+encodeURIComponent(room));
     this.ws=ws;
     ws.onopen=()=>this.send({t:'hello',token});
     ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.t==='welcome')this.userId=d.you&&d.you.id;this.handlers[d.t]&&this.handlers[d.t](d);};
     ws.onclose=()=>setTimeout(()=>this.connect(),600);
    },
    move(x,z){this.send({t:'move',x:Number(x),z:Number(z),id:'mv'+(seq++)});},
    invite(to){this.send({t:'chat-invite',to,id:'inv'+(seq++)});},
    accept(from,id){this.send({t:'chat-accept',from,id});},
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
   const holder={name,room,snapIntervals:[],lastSnap:0,moves:0,reconnects:0,client:null};
   holder.client=makeClient(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/world`,room,auth.token,{'chat-invited':d=>holder.client.accept(d.from,d.id)});
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
  await page.evaluate(()=>{
   for(const p of window.__soak){
    const ws=p.client.ws;
    if(!ws||ws.readyState!==1){if(Math.random()<0.3){p.client.connect();p.reconnects++;}continue;}
    if(Math.random()<0.5){p.client.move((Math.random()*32-16).toFixed(1),(Math.random()*24-12).toFixed(1));p.moves++;}
    if(Math.random()<0.04){
     const other=window.__soak[Math.floor(Math.random()*window.__soak.length)];
     if(other!==p&&other.client.userId)p.client.invite(other.client.userId);
    }
    if(Math.random()<0.008){ws.close();p.reconnects++;}
   }
  });
  if(Date.now()-lastLog>30000){
   lastLog=Date.now();
   const rooms=await (await fetch(`${base}/api/rooms`)).json();
   console.log(`t+${((Date.now()-started)/1000).toFixed(0)}s · ${rooms.rooms.map(r=>`${r.id}:${r.online}人在线${r.waiting?`/${r.waiting}排队`:''}`).join(' · ')} · RSS ${(serverRss()/1048576).toFixed(0)}MB`);
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
 console.log('PASS: soak 完成——无页面错误，快照节奏与内存增长有界，断线重连与排队行为正常。');
}
try{await main();}finally{server.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true});}
