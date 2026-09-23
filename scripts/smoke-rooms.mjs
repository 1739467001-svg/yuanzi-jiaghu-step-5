// 多房间分流验收：以 ATOM_ROOMS 增加第二个房间启动服务，验证
// 两个房间的用户互不可见、占用统计正确、切换房间后看到彼此。
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const PORT=5190;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-rooms-e2e-'));
const roomEnv={ATOM_ROOMS:'teahouse:江湖茶楼:5',ATOM_DATA_DIR:tmp};
const server=process.env.TEST_PROD==='1'
 ?spawn('node',['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',...roomEnv},stdio:'pipe'})
 :spawn('npx',['vite','--host','127.0.0.1','--port',String(PORT)],{cwd:process.cwd(),env:{...process.env,...roomEnv},stdio:'pipe'});
const waitReady=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('服务未就绪');};
const run=Date.now().toString(36);
const base=`http://127.0.0.1:${PORT}`;
const errors=[];
try{
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const newPage=async(label)=>{const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(`${label}: ${e.message}`));return page;};
 const register=async(page,name,room)=>{
  await page.goto(base);
  await page.waitForSelector('.scene-pin.player');
  await page.getByRole('button',{name:'切换世界模式'}).click();
  await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
  await page.getByRole('textbox',{name:'名帖昵称'}).fill(`房客${name}-${run}`);
  await page.getByRole('textbox',{name:'密码'}).fill('password123');
  await page.getByRole('button',{name:'创建并进入联机世界'}).click();
  await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:20000});
  if(room&&room!=='jianghu'){
   await page.locator('.room-list button',{hasText:'江湖茶楼'}).click();
   await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
   await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:20000});
  }
 };
 // A 在主镇，B 在茶楼：互不可见。
 const a=await newPage('A'),b=await newPage('B');
 await register(a,'甲');await register(b,'乙','teahouse');
 await a.waitForFunction(()=>(window.__atomOnlinePlayers||[]).length===8,null,{timeout:15000});
 await b.waitForFunction(()=>(window.__atomOnlinePlayers||[]).length===8,null,{timeout:15000});
 assert.ok(!(await a.evaluate(()=>(window.__atomOnlinePlayers||[]).some(p=>!p.ai))),'主镇只有 AI 与本人');
 assert.ok(!(await b.evaluate(()=>(window.__atomOnlinePlayers||[]).some(p=>!p.ai))),'茶楼只有 AI 与本人');
 // 占用统计：两个房间各 1 位真人。
 const rooms=await (await fetch(`${base}/api/rooms`)).json();
 assert.equal(rooms.rooms.find(r=>r.id==='jianghu').online,1);
 assert.equal(rooms.rooms.find(r=>r.id==='teahouse').online,1);
 // A 切换到茶楼：两人互见。
 await a.locator('.room-list button',{hasText:'江湖茶楼'}).click();
 await a.waitForFunction(()=>(window.__atomOnlinePlayers||[]).some(p=>!p.ai),null,{timeout:20000});
 await b.waitForFunction(()=>(window.__atomOnlinePlayers||[]).some(p=>!p.ai),null,{timeout:20000});
 const viewA=await a.evaluate(()=>(window.__atomOnlinePlayers||[]).filter(p=>!p.ai).map(p=>p.name));
 const viewB=await b.evaluate(()=>(window.__atomOnlinePlayers||[]).filter(p=>!p.ai).map(p=>p.name));
 const NAME_A=`房客甲-${run}`,NAME_B=`房客乙-${run}`;
 assert.deepEqual(viewA,[NAME_B],'A 在茶楼看到 B');
 assert.deepEqual(viewB,[NAME_A],'B 看到 A');
 assert.deepEqual(errors,[],`页面异常: ${errors.join('; ')}`);
 await browser.close();
 console.log('PASS: 房间隔离（互不可见）、占用统计、切换房间后互见。');
}finally{
 server.kill('SIGTERM');
 fs.rmSync(tmp,{recursive:true,force:true});
}
if(errors.length)process.exitCode=1;
