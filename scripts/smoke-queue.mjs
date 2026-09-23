// 满员排队验收：以 ATOM_ROOM_CAPACITY=2 启动本地服务，三个浏览器上下文验证
// “第三人排队并看到位置 → 一人离开 → 窗口过后第三人自动进入 → 也可取消排队”。
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const PORT=5184;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-queue-'));
const queueEnv={ATOM_ROOM_CAPACITY:'2',ATOM_RECLAIM_WINDOW_MS:'2500',ATOM_DATA_DIR:tmp};
const vite=process.env.TEST_PROD==='1'
 ?spawn('node',['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',...queueEnv},stdio:'pipe'})
 :spawn('npx',['vite','--host','127.0.0.1','--port',String(PORT)],{cwd:process.cwd(),env:{...process.env,...queueEnv},stdio:'pipe'});
const waitReady=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('vite 未就绪');};
const run=Date.now().toString(36);
const base=`http://127.0.0.1:${PORT}`;
const errors=[];
try{
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const contexts=[];const pages=[];
 for(let i=0;i<3;i++){const ctx=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(ctx);pages.push(await ctx.newPage());pages[i].on('pageerror',e=>errors.push(`P${i}: ${e.message}`));}
 const register=async(page,name)=>{
  await page.goto(base);
  await page.waitForSelector('.scene-pin.player');
  await page.getByRole('button',{name:'切换世界模式'}).click();
  await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
  await page.getByRole('textbox',{name:'名帖昵称'}).fill(`排队${name}-${run}`);
  await page.getByRole('textbox',{name:'密码'}).fill('password123');
  await page.getByRole('button',{name:'创建并进入联机世界'}).click();
 };
 await register(pages[0],'甲');await register(pages[1],'乙');
 await pages[0].waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
 await pages[1].waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
 // 第三人：满员 → 排队并看到位置。
 await register(pages[2],'丙');
 await pages[2].waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('排队中'),null,{timeout:20000});
 assert.match(await pages[2].locator('.queue-card').textContent(),/第 1 位/,'排队卡片显示位置');
 assert.match(await pages[2].locator('.queue-card').textContent(),/取消排队/);
 // 甲离开（切回本地演示）→ reclaim 窗口过后丙自动进入。
 await pages[0].getByRole('button',{name:'切换世界模式'}).click();
 await pages[2].waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
 assert.match(await pages[2].locator('.map-caption').textContent(),/位侠客在此相聚/,'自动进入后正常可见');
 // 取消排队路径：乙离开后丁排队再取消。
 const ctxD=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(ctxD);
 const d=await ctxD.newPage();d.on('pageerror',e=>errors.push('D: '+e.message));
 await register(d,'丁');
 await d.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('排队中'),null,{timeout:20000});
 await d.getByRole('button',{name:'取消排队'}).click();
 await d.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('进入联机'),null,{timeout:10000});
 assert.deepEqual(errors,[],`页面异常: ${errors.join('; ')}`);
 await browser.close();
 console.log('PASS: 满员排队（位置可见）、离开后自动进入、取消排队。');
}finally{
 vite.kill('SIGTERM');
 fs.rmSync(tmp,{recursive:true,force:true});
}
if(errors.length)process.exitCode=1;
