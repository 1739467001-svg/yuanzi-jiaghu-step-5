#!/usr/bin/env node
// 无头帧率基线：三个场景（小镇日景/小镇夜景/展示馆）各采样 10 秒，输出平均帧率与帧间隔。
// 用法：先 npm run build 并起服务，然后 node scripts/fps-baseline.mjs（TEST_BASE_URL 可指定地址）。
//
// 口径说明（重要）：无头 Chrome 用的是软件渲染（SwiftShader），数值只用于**回归对比**
// （改动前后同一台机器上的相对变化），不构成 PRD 15.1 要求的真实设备帧率证据——
// 那个口径要在 M1/16GB Mac 与中端 Windows 独显机上复测，见 docs/NEXT_TASK_PLAN.md。
import {chromium} from '@playwright/test';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const SAMPLE_MS=10000;
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
// 帧率采样：数 requestAnimationFrame 回调次数（与渲染循环同节奏）。
const sample=async()=>page.evaluate(ms=>new Promise(resolve=>{
 let frames=0;const start=performance.now();const gaps=[];let last=start;
 const tick=now=>{frames++;gaps.push(now-last);last=now;if(now-start<ms)requestAnimationFrame(tick);else{
  gaps.sort((a,b)=>a-b);
  resolve({fps:frames/((now-start)/1000),p50:gaps[Math.floor(gaps.length/2)],p95:gaps[Math.floor(gaps.length*0.95)]});
 }};
 requestAnimationFrame(tick);
}),SAMPLE_MS);

const results=[];
try{
 await page.goto(base);await page.waitForSelector('.scene-pin.player');await page.waitForTimeout(2500);
 results.push({scene:'小镇 · 日景',...(await sample())});
 await page.getByRole('button',{name:'切换夜景',exact:true}).click();await page.waitForTimeout(1200);
 results.push({scene:'小镇 · 夜景',...(await sample())});
 await page.getByRole('button',{name:'切换日景',exact:true}).click();await page.waitForTimeout(600);
 // 「武林大会」导航即进展馆（enterHall）；等展厅作品卡出现再采样。
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 await page.locator('.work-card').first().waitFor({state:'visible',timeout:20000});
 await page.waitForTimeout(2000);
 results.push({scene:'展示馆',...(await sample())});
}finally{
 await browser.close();
}
console.log(`无头帧率基线（${base}，软件渲染口径，仅作回归对比）`);
for(const r of results)console.log(`  ${r.scene}: 平均 ${r.fps.toFixed(1)} fps · 帧间隔 p50 ${r.p50.toFixed(1)}ms · p95 ${r.p95.toFixed(1)}ms`);
if(errors.length){console.error('页面异常:',errors.join('; '));process.exit(1);}
