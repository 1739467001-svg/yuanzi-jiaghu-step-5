// GLB 模式人工验收截图：模型清单启用后场景应正常渲染、无页面异常。
import {chromium} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5187';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);
await page.waitForSelector('.scene-pin.player');
await page.waitForTimeout(2500);
await page.screenshot({path:'artifacts/world-glb.png'});
await browser.close();
console.log(errors.length?'FAIL '+errors.join(';'):'PASS glb render');
