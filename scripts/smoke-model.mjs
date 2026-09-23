// 模型通道集成验收：用本地 mock 的 OpenAI 兼容服务启动带模型配置的 dev 服务，
// 验证联机 AI 私聊走真实模型通道、模式标注为“模型对话”、持久账本记录用量，
// 以及预算达到硬上限后暂停新模型调用并如实回退（看展与真人聊天不受影响）。
import {chromium} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const PORT=5181,MOCK=4599;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-model-'));
let mockCalls=0;
const mock=http.createServer((req,res)=>{
 let body='';
 req.on('data',c=>body+=c);
 req.on('end',()=>{
  mockCalls++;
  const parsed=JSON.parse(body||'{}');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{message:{content:`【mock-${parsed.model}】我在馆里看过《SkillHub》，挺务实。`}}],usage:{prompt_tokens:200,completion_tokens:30}}));
 });
});
await new Promise(r=>mock.listen(MOCK,'127.0.0.1',r));
const modelEnv={ATOM_LLM_BASE_URL:`http://127.0.0.1:${MOCK}/v1`,ATOM_LLM_API_KEY:'mock-key',ATOM_LLM_MODEL:'mock-model',ATOM_DAILY_BUDGET:'0.005',ATOM_DAILY_CALL_LIMIT:'100',ATOM_MAX_CONCURRENT:'3',ATOM_PRICE_IN_PER_MTOK:'10',ATOM_PRICE_OUT_PER_MTOK:'20',ATOM_DATA_DIR:tmp};
// TEST_PROD=1 时验证生产服务（node server/index.mjs），否则验证 Vite dev 服务。
const vite=process.env.TEST_PROD==='1'
 ?spawn('node',['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1',...modelEnv},stdio:'pipe'})
 :spawn('npx',['vite','--host','127.0.0.1','--port',String(PORT)],{cwd:process.cwd(),env:{...process.env,...modelEnv},stdio:'pipe'});
const waitReady=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/api/content/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('vite 未就绪');};
try{
 await waitReady();
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${PORT}`);
 await page.waitForSelector('.scene-pin.player');
 // 注册账号并进入联机世界（联机身份由服务端会话决定）。
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(`模型少侠-${Date.now().toString(36)}`);
 await page.getByRole('textbox',{name:'密码'}).fill('password123');
 await page.getByRole('button',{name:'创建并进入联机世界'}).click();
 await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:20000});
 await page.locator('.nearby-avatars button',{hasText:'阿原'}).click();
 await page.getByRole('button',{name:'发起私聊'}).click();
 await page.getByRole('dialog',{name:'与阿原私聊'}).waitFor();
 // 前两次走模型通道；每次约 0.0026，预算 0.005 → 第三次起达到硬上限。
 for(const text of ['你好，介绍下自己','推荐效率工具作品','再推荐一个','还要一个']){
  await page.getByRole('textbox',{name:'私聊消息'}).fill(text);
  await page.getByRole('button',{name:'发送私聊'}).click();
  await page.waitForFunction(t=>document.querySelector('.chat-messages')?.textContent.includes(t),text,{timeout:15000});
  await page.waitForFunction(()=>document.querySelectorAll('.chat-messages .message.assistant').length>=1,null,{timeout:15000});
 }
 const messages=await page.locator('.chat-messages').textContent();
 assert.match(messages,/【mock-mock-model】/,'前两次回复来自模型通道');
 assert.match(messages,/额度已达上限/,'预算达到硬上限后暂停新模型调用并如实说明');
 assert.match(await page.locator('.chat-mode').textContent(),/AI 侠客/);
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/online-ai-model.png'});
 const ledger=JSON.parse(fs.readFileSync(path.join(tmp,'usage-ledger.json'),'utf8'));
 const day=Object.values(ledger.days)[0];
 assert.ok(day.cost>0,'账本记录了费用');
 assert.equal(day.calls,2,'只有成功的模型调用计入次数');
 assert.ok(mockCalls>=2,'mock 模型被真实调用');
 // 看展不受影响：展厅仍可打开。
 await page.getByRole('button',{name:'关闭窗口'}).click();
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 assert.equal(await page.locator('.work-card').count(),38,'预算上限不影响看展');
 assert.deepEqual(errors,[],`页面异常: ${errors.join('; ')}`);
 await browser.close();
 console.log(`PASS: 模型通道（mock 调用 ${mockCalls} 次，账本 ${day.calls} 次/${day.cost}）、硬上限回退、看展不受影响。`);
}finally{
 vite.kill('SIGTERM');
 mock.close();
 fs.rmSync(tmp,{recursive:true,force:true});
}
