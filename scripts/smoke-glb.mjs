// GLB 资产管线验收：有模型时走 GLB 通道；模型缺失时明确回退程序化且不阻断场景。
// 需要本地 dev/preview 服务已启动（含 /models/character-default.glb 当前启用状态）。
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const root=path.resolve(import.meta.dirname,'..');
// 生产服务（TEST_BASE_URL 指定）从 dist/ 提供文件；dev 服务用 public/。
const glbPath=process.env.TEST_BASE_URL
 ?path.join(root,'dist','models','character-default.glb')
 :path.join(root,'public','models','character-default.glb');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
try{
 // 1. 有 GLB：模型加载成功，场景正常，点击移动可用。
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>errors.push('GLB: '+e.message));
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 const status=await page.evaluate(()=>window.__atomModels||null);
 assert.ok(status,'预载状态可见');
 assert.ok(status.loaded.includes('/models/character-default.glb'),'GLB 已加载');
 const box=await page.locator('.webgl-host').boundingBox();
 await page.mouse.click(box.x+box.width*.3,box.y+box.height*.5);
 await page.waitForTimeout(1500);
 assert.match(await page.locator('.map-caption').textContent(),/8 位 AI 侠客在此生活/,'GLB 模式下场景与交互正常');
 await page.close();
 // 2. 无 GLB：把模型文件移开，重新加载应回退程序化且不报错。
 fs.renameSync(glbPath,glbPath+'.bak');
 const fallback=await browser.newPage({viewport:{width:1280,height:800}});
 fallback.on('pageerror',e=>errors.push('fallback: '+e.message));
 await fallback.goto(base);
 await fallback.waitForSelector('.scene-pin.player');
 const fallbackStatus=await fallback.evaluate(()=>window.__atomModels||null);
 assert.ok(fallbackStatus.failed.includes('/models/character-default.glb'),'缺失的模型被标记为失败');
 assert.equal(fallbackStatus.loaded.length,0,'没有可用 GLB');
 const fbox=await fallback.locator('.webgl-host').boundingBox();
 await fallback.mouse.click(fbox.x+fbox.width*.3,fbox.y+fbox.height*.5);
 await fallback.waitForTimeout(1500);
 assert.match(await fallback.locator('.map-caption').textContent(),/8 位 AI 侠客在此生活/,'回退程序化后场景与交互正常');
 await fallback.close();
 assert.deepEqual(errors,[],`页面异常: ${errors.join('; ')}`);
 console.log('PASS: GLB 通道加载与渲染、缺失时回退程序化，两种形态交互均正常。');
}finally{
 if(fs.existsSync(glbPath+'.bak'))fs.renameSync(glbPath+'.bak',glbPath);
 await browser.close();
}
