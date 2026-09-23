// 前端稳定性 soak（PRD 15.1 / A20 前端部分）：两个标签页对生产服务持续操作，
// 验证无崩溃、无重复会话、无持续内存泄漏，并记录帧率（无头软件渲染口径）。
//   node scripts/soak-browser.mjs                    # 默认 60 分钟
//   ATOM_SOAK_MINUTES=10 node scripts/soak-browser.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execSync} from 'node:child_process';
import {chromium} from '@playwright/test';

const PORT=Number(process.env.ATOM_SOAK_PORT)||5200;
const MINUTES=Math.max(1,Number(process.env.ATOM_SOAK_MINUTES)||60);
const DURATION_MS=MINUTES*60000;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-soak-fe-'));
const base=`http://127.0.0.1:${PORT}`;
const server=spawn('node',['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',ATOM_DATA_DIR:tmp},stdio:'pipe'});
const waitReady=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(`${base}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('服务未就绪');};
const serverRss=()=>{try{
 if(process.platform==='darwin')return Number(execSync(`ps -o rss= -p ${server.pid}`).toString().trim())*1024;
 return Number(fs.readFileSync(`/proc/${server.pid}/status`,'utf8').match(/VmRSS:\s*(\d+)/)[1])*1024;
}catch{return 0;}};

async function main(){
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const pageErrors=[];
 const newTab=async(label)=>{
  const page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(`${label}: ${e.message}`));
  page.on('crash',()=>pageErrors.push(`${label}: 页面崩溃`));
  return page;
 };
 // A：注册并进入联机世界；B：同账号第二个标签页（触发接管，覆盖该路径且不产生重复控制者）。
 const a=await newTab('A'),b=await newTab('B');
 const enter=async(page,name)=>{
  await page.goto(base);
  await page.waitForSelector('.scene-pin.player');
  await page.getByRole('button',{name:'切换世界模式'}).click();
  // 未登录弹注册框；已登录（同上下文令牌恢复，即第二个标签页）直接进入。
  const dialog=page.getByRole('dialog',{name:'创建侠客名帖'});
  if(await dialog.isVisible().catch(()=>false)){
   await page.getByRole('textbox',{name:'名帖昵称'}).fill(`soakfe-${name}-${Date.now().toString(36)}`);
   await page.getByRole('textbox',{name:'密码'}).fill('password123');
   await page.getByRole('button',{name:'创建并进入联机世界'}).click();
  }
  await page.waitForFunction(()=>window.__atomOnlineSelf!==undefined,null,{timeout:20000});
 };
 await enter(a,'A');
 await enter(b,'B');
 assert.ok(await b.evaluate(()=>!!window.__atomOnlineSelf),'第二个标签页接管控制');
 await a.waitForTimeout(1500);
 const samples=[];
 const started=Date.now();
 let lastLog=Date.now(),actions=0;
 const rssStart=await serverRss();
 const sample=async()=>{try{
  const [heap,fps,actors]=await Promise.all([
   a.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0),
   a.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<1000)requestAnimationFrame(f);else res(Math.round(n*1000/(performance.now()-t0)));};requestAnimationFrame(f);})),
   a.evaluate(()=>(window.__atomOnlinePlayers||[]).length),
  ]);
  samples.push({t:Math.round((Date.now()-started)/1000),heapMB:heap,fps,actors});}catch{}};
 const loop=setInterval(async()=>{
  try{
   const box=await a.locator('.webgl-host').boundingBox();
   if(box){await a.mouse.click(box.x+box.width*(0.3+Math.random()*0.4),box.y+box.height*(0.45+Math.random()*0.25));actions++;}
   if(actions%5===0){
    await a.getByRole('button',{name:'武林大会',exact:true}).click();await a.waitForTimeout(400);
    const cards=a.locator('.work-card');
    if(await cards.count()){await cards.first().click();await a.waitForTimeout(600);await a.getByRole('button',{name:'关闭窗口'}).first().click();}
    await a.getByRole('button',{name:'漫游小镇'}).click();actions++;
   }
   if(actions%7===0){await a.getByRole('button',{name:/推荐效率工具作品|今天在馆里看了什么/}).first().click().catch(()=>{});actions++;}
   if(actions%11===0){await a.getByRole('button',{name:'切换夜景',exact:true}).click().catch(()=>{});actions++;}
  }catch{}
  if(Date.now()-lastLog>120000){
   lastLog=Date.now();
   await sample();
   const s=samples.at(-1);
   console.log(`t+${s.t}s · heap ${s.heapMB}MB · fps ${s.fps} · 房间内角色 ${s.actors} · RSS ${(serverRss()/1048576).toFixed(0)}MB`);
  }
 },4000);
 const firstSample=setTimeout(()=>{sample().catch(()=>{});},30000);
 await new Promise(r=>setTimeout(r,DURATION_MS));
 clearInterval(loop);
 clearTimeout(firstSample);
 await sample().catch(()=>{});
 const rssEnd=await serverRss();
 const heaps=samples.map(s=>s.heapMB).filter(Boolean);
 const fpss=samples.map(s=>s.fps).filter(Boolean).sort((x,y)=>x-y);
 const actorCounts=samples.map(s=>s.actors);
 const report={
  generatedAt:new Date().toISOString(),durationMinutes:MINUTES,tabs:2,samples:samples.length,
  heapMB:{first:heaps[0]||0,last:heaps.at(-1)||0,growth:heaps.length?+(heaps.at(-1)-heaps[0]).toFixed(1):0,max:Math.max(0,...heaps)},
  fps:{p10:fpss.length?fpss[Math.floor(fpss.length*.1)]:0,min:fpss[0]||0,note:'无头软件渲染口径，非真实 GPU 表现'},
  actors:{min:Math.min(...actorCounts),max:Math.max(...actorCounts)},
  server:{rssStartMB:+(rssStart/1048576).toFixed(1),rssEndMB:+(rssEnd/1048576).toFixed(1)},
  pageErrors:pageErrors.slice(0,10),
 };
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/soak-browser-report.json',JSON.stringify(report,null,2));
 console.log('--- 前端 soak 报告（artifacts/soak-browser-report.json）---');
 console.log(JSON.stringify(report,null,2));
 await browser.close();
 assert.deepEqual(pageErrors,[],`页面异常: ${pageErrors.slice(0,3).join('; ')}`);
 assert.ok(report.heapMB.growth<150,`heap 增长 ${report.heapMB.growth}MB 超限`);
 assert.ok(report.actors.max<=report.actors.min+1,'角色数应稳定（无重复会话）');
 console.log('PASS: 前端 soak 完成——无页面异常、无重复会话、heap 增长有界。');
}
try{await main();}finally{server.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true});}
