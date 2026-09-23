// 联机模式人工验收截图：双账号互见、邀请弹窗、私聊面板。
import {chromium} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5177';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
async function enter(page,name){
 await page.goto(base);await page.waitForSelector('.scene-pin.player');
 await page.getByRole('button',{name:'小镇设置',exact:true}).click();
 await page.getByRole('textbox',{name:'我的昵称'}).fill(name);
 await page.getByRole('button',{name:'关闭窗口'}).click();
 const status=(await page.locator('.world-status').textContent())||'';
 if(!/联机世界|连接中|重连中|已被接管|房间已满/.test(status))await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:15000});
 await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:15000});
}
const ctxA=await browser.newContext({viewport:{width:1280,height:800}});
const ctxB=await browser.newContext({viewport:{width:1280,height:800}});
const a=await ctxA.newPage(),b=await ctxB.newPage();
a.on('pageerror',e=>errors.push('A: '+e.message));
b.on('pageerror',e=>errors.push('B: '+e.message));
await enter(a,'联机甲');await enter(b,'联机乙');
await a.waitForFunction(()=>(window.__atomOnlinePlayers||[]).some(p=>p.name==='联机乙'),null,{timeout:10000});
await b.waitForFunction(()=>(window.__atomOnlinePlayers||[]).some(p=>p.name==='联机甲'),null,{timeout:10000});
await a.waitForTimeout(2500);
await a.screenshot({path:'artifacts/online-a.png'});
await b.screenshot({path:'artifacts/online-b.png'});
// 邀请与私聊。
await a.locator('.nearby-avatars button',{hasText:'联机乙'}).click();
await a.getByRole('button',{name:'发起私聊'}).click();
await b.getByRole('dialog',{name:'聊天邀请'}).waitFor();
await b.screenshot({path:'artifacts/online-invite.png'});
await b.getByRole('button',{name:'接受邀请'}).click();
await a.getByRole('dialog',{name:'与联机乙私聊'}).waitFor();
await a.getByRole('textbox',{name:'私聊消息'}).fill('乙，今晚一起去展示馆看《新奇特选品雷达》吗？');
await a.getByRole('button',{name:'发送私聊'}).click();
await b.waitForFunction(()=>document.querySelector('.chat-messages')?.textContent.includes('新奇特选品雷达'),null,{timeout:10000});
await a.screenshot({path:'artifacts/online-chat-a.png'});
await b.screenshot({path:'artifacts/online-chat-b.png'});
await a.getByRole('button',{name:'离开会话'}).click();
await a.waitForTimeout(600);
// 与 AI 侠客私聊：立即开始，回复引用已发布作品并附卡片。
await a.locator('.nearby-avatars button',{hasText:'阿原'}).click();
await a.screenshot({path:'artifacts/online-ai-card.png'});
await a.getByRole('button',{name:'发起私聊'}).click();
await a.getByRole('dialog',{name:'与阿原私聊'}).waitFor();
await a.getByRole('textbox',{name:'私聊消息'}).fill('推荐效率工具作品');
await a.getByRole('button',{name:'发送私聊'}).click();
await a.waitForFunction(()=>document.querySelectorAll('.chat-work').length>0,null,{timeout:15000});
await a.waitForTimeout(400);
await a.screenshot({path:'artifacts/online-ai-chat.png'});
await browser.close();
console.log(errors.length?'FAIL '+errors.join(';'):'PASS online screenshots');
