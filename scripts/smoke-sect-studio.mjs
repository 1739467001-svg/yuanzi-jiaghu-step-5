// M1 验收：注册→建派→布局工作室（选预设/换主题/发布）→ 刷新保持 → 访客链接看到同一套。
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const port=5398;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-m1-'));
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ATOM_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const problems=[];
const check=(name,ok,extra='')=>{console.log((ok?'✅ ':'❌ ')+name+(extra?' → '+extra:''));if(!ok)problems.push(name);};
const cleanup=()=>{try{server.kill('SIGTERM');}catch{}try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}};
process.on('exit',cleanup);
try{
 for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/sects?page=1&size=1');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.goto(base);await page.waitForSelector('.scene-pin.player');
 const skip=page.getByRole('button',{name:'跳过引导'});
 if(await skip.count())await skip.click();
 // 注册 + 建派
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 const nick='M1掌门-'+Date.now().toString(36);
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(nick);
 await page.getByRole('textbox',{name:'密码'}).fill('password123');
 await page.getByRole('button',{name:/创建并进入联机世界|创建名帖，进入江湖/}).click();
 await page.waitForFunction(n=>document.querySelector('.profile-button')?.textContent.includes(n),nick,{timeout:20000});
 await page.getByRole('button',{name:'切换世界模式'}).click(); // 回本地演示（账号保持）
 await page.waitForTimeout(900);
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 const sectName='M1测试门派'+Date.now().toString(36).slice(-4);
 await page.getByRole('textbox',{name:'门派名称'}).fill(sectName);
 await page.getByRole('textbox',{name:'门派 slogan'}).fill('预设可更换');
 await page.getByRole('button',{name:'创立门派'}).click();
 await page.waitForFunction(n=>document.querySelector('.toast')?.textContent.includes(n),sectName,{timeout:10000});
 await page.locator('.sect-row',{hasText:sectName}).click();
 await page.waitForSelector('.sect-hud.interior');
 check('进入自己门派的内景',(await page.locator('.sect-hud.interior h3').textContent()).includes(sectName));
 // 布置面板
 check('布置面板出现（仅创始人）',await page.locator('.sect-studio').count()===1);
 await page.getByRole('button',{name:/湖畔 · 听水/}).click();
 await page.getByRole('button',{name:'黛蓝·远'}).click();
 const summary=await page.locator('.sect-studio-summary').textContent();
 check('预设与主题可切换',summary.includes('湖畔')&&summary.includes('黛蓝'),summary.replace(/\n/g,' ').slice(0,60));
 await page.getByRole('button',{name:/发布小镇/}).click();
 await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('门派小镇已发布'),null,{timeout:10000});
 const toast=await page.locator('.toast').textContent();
 check('发布成功并说明地形',toast.includes('湖畔'),toast.slice(0,50));
 const afterSummary=await page.locator('.sect-studio-summary').textContent();
 check('发布后摘要即新布局',afterSummary.includes('湖畔'),afterSummary.replace(/\n/g,' ').slice(0,50));
 // 服务端持久化
 const apiLayout=await (await fetch(base+'/api/sects')).json();
 // 直接用页面请求拿自己的门派（需要 token：从 localStorage 取）
 const token=await page.evaluate(()=>localStorage.getItem('authToken'));
 const list=await (await fetch(base+'/api/sects?page=3&size=4',{headers:{'x-atom-token':token}})).json();
 const mine=list.sects.find(s=>s.name===sectName)||list.sects[list.sects.length-1];
 check('布局已落库',mine?.townLayout?.terrain==='lakeside','terrain='+mine?.townLayout?.terrain);
 // 刷新后保持
 await page.reload();await page.waitForSelector('.scene-pin.player');
 await page.waitForTimeout(1200);
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 await page.getByRole('button',{name:'下一页'}).click();await page.waitForTimeout(400);
 await page.getByRole('button',{name:'下一页'}).click();await page.waitForTimeout(400);
 await page.locator('.sect-row',{hasText:sectName}).first().click();
 await page.waitForSelector('.sect-hud.interior');
 await page.waitForTimeout(600);
 check('刷新后仍显示已发布布局',(await page.locator('.sect-studio-summary').textContent()).includes('湖畔'));
 // 访客链接
 const shareUrl=`${base}/?sect=${mine.id}`;
 const guest=await browser.newPage({viewport:{width:1280,height:800}});
 await guest.goto(shareUrl);
 await guest.waitForSelector('.sect-hud.interior',{timeout:15000});
 check('访客链接直达且无布置面板',await guest.locator('.sect-studio').count()===0);
 check('访客看到同一门派的标题',(await guest.locator('.sect-hud.interior h3').textContent()).includes(sectName));
 await guest.close();
 check('页面无 JS 报错',errs.length===0,errs.join('|'));
}finally{ await browser.close(); cleanup(); }
if(problems.length){console.log('\n未通过：'+problems.join('、'));process.exitCode=1;}
else console.log('\n✅ M1 全部通过');
