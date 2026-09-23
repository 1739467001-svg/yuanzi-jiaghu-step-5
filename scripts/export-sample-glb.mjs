// 生成示例 GLB：启动本地 dev 服务，在浏览器里用 three GLTFExporter 导出程序化角色，
// 写入 public/models/character-default.glb 作为可替换基线。正式模型可直接覆盖此文件。
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const PORT=5186;
const root=path.resolve(import.meta.dirname,'..');
const vite=spawn('npx',['vite','--host','127.0.0.1','--port',String(PORT)],{cwd:root,stdio:'pipe'});
const waitReady=async()=>{for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('vite 未就绪');};
try{
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const page=await browser.newPage();
 page.on('pageerror',e=>{throw new Error('页面错误: '+e.message);});
 await page.goto(`http://127.0.0.1:${PORT}`);
 const bytes=await page.evaluate(async()=>{
  const {exportCharacterGLB}=await import('/src/world/export-sample.js');
  const result=await exportCharacterGLB();
  return Array.from(result);
 });
 const target=path.join(root,'public','models','character-default.glb');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,Buffer.from(bytes));
 console.log(`written ${target} (${(bytes.length/1024).toFixed(1)} KB)`);
 await browser.close();
}finally{
 vite.kill('SIGTERM');
}
