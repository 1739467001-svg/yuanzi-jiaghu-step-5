import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const out=process.argv[2]||'/tmp/atom-shots';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
async function shot(page,name,{wait=2200}={}){
  await page.waitForTimeout(wait);
  await page.screenshot({path:`${out}/${name}.png`});
  console.log('shot',name);
}
const esc=async page=>{for(let i=0;i<4;i++){const b=page.locator('.dialog-shade:not([inert]) .dialog-header button[aria-label="关闭窗口"]').last();if(await b.count()===0)break;await b.click({timeout:2000}).catch(()=>{});await page.waitForTimeout(250);}await page.waitForTimeout(200);};
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await shot(page,'01-town-day');
 await page.click('.world-tools button[aria-label="切换夜景"]');
 await shot(page,'02-town-night');
 await page.click('.world-tools button[aria-label="切换日景"]');
 await page.click('.topbar nav button:has-text("武林大会")');
 await shot(page,'03-hall-gallery',{wait:2600});
 await esc(page);
 await shot(page,'04-hall-scene-day',{wait:1200});
 await page.click('.world-tools button[aria-label="切换夜景"]');
 await shot(page,'05-hall-night');
 await page.click('.world-tools button[aria-label="切换日景"]');
 await page.click('.topbar nav button:has-text("武林大会")');
 await page.click('.work-card');
 await shot(page,'06-work-detail');
 await esc(page);await esc(page);
 await page.click('.welcome-card .primary-button');
 await shot(page,'07-chat');
 await page.fill('.chat-form input','推荐效率工具作品');
 await page.click('.chat-form button[aria-label="发送消息"]');
 await shot(page,'08-chat-answer',{wait:2600});
 await esc(page);
 await page.click('.topbar nav button:has-text("游历手札")');
 await shot(page,'09-journal');
 await esc(page);
 await page.click('.rail-footer button');
 await shot(page,'10-about');
 await esc(page);
 await page.click('.topbar .profile-button');
 await shot(page,'11-settings');
 await page.close();
}
{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push('mobile pageerror: '+e.message));
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await shot(page,'12-mobile-town');
 await page.click('.topbar nav button:has-text("武林大会")');
 await shot(page,'13-mobile-hall',{wait:2600});
 await page.close();
}
console.log('errors:',JSON.stringify(errors,null,1));
await browser.close();
