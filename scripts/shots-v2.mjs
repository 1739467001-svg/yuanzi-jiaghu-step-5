// v2 功能截图：AI 观展气泡、品牌元素、聊天观展见闻。仅用于人工验收，不属于回归测试。
import {chromium} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.waitForSelector('.scene-pin.player');await page.waitForTimeout(1200);
 await page.screenshot({path:'artifacts/v2-town-day.png'});
 // 等待 AI 侠客完成至少一次观展（走到展示馆并生成观感）。
 await page.waitForFunction(()=>document.querySelector('.happenings')&&[...document.querySelectorAll('.event p')].some(p=>/《.+》/.test(p.textContent)&&/。/.test(p.textContent)),null,{timeout:120000});
 await page.waitForTimeout(2500);
 await page.screenshot({path:'artifacts/v2-town-viewing.png'});
 // 观展事件进入“江湖此刻”。
 const happenings=await page.locator('.happenings').textContent();
 console.log('happenings sample:',happenings.replace(/\s+/g,' ').slice(0,160));
 // 关于面板：官方 Logo、原子之心父品牌、表情包墙。
 await page.getByRole('button',{name:/关于这个世界/}).click();
 await page.waitForTimeout(600);
 await page.screenshot({path:'artifacts/v2-about-brand.png'});
 await page.getByRole('button',{name:'关闭窗口'}).click();
 // 聊天：侠客聊起自己的观展见闻。
 await page.getByRole('button',{name:'和阿原聊聊'}).click();
 await page.getByRole('button',{name:'你今天在馆里看了什么？',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.chat-messages').textContent.includes('展示馆'),null,{timeout:15000});
 await page.waitForTimeout(400);
 await page.screenshot({path:'artifacts/v2-chat-views.png'});
 const chatText=await page.locator('.chat-messages').textContent();
 console.log('chat reply sample:',chatText.replace(/\s+/g,' ').slice(0,220));
 // 3D 展厅。
 await page.getByRole('button',{name:'关闭窗口'}).click();
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 await page.waitForTimeout(1800);
 await page.screenshot({path:'artifacts/v2-hall.png'});

 if(errors.length){console.log('PAGE ERRORS:',errors);process.exitCode=1;}
}finally{await browser.close();}
console.log(errors.length?'FAIL':'PASS v2 screenshots');
