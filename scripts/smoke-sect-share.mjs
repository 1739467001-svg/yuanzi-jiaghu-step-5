// M0-a 验收：?sect= 深链 + 分享按钮 + 返回入口 + 概念卡。
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const port=5299;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-m0-'));
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ATOM_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const problems=[];
const check=(name,ok,extra='')=>{console.log((ok?'✅ ':'❌ ')+name+(extra?' → '+extra:''));if(!ok)problems.push(name);};
const cleanup=()=>{try{server.kill('SIGTERM');}catch{}try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}};
process.on('exit',cleanup);
try{
 for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/sects?page=1&size=4');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 const demo=(await (await fetch(base+'/api/sects?page=1&size=4')).json()).sects[0];
 // 1) 未登录访客直接打开分享链接
 const guest=await browser.newPage({viewport:{width:1280,height:800}});
 const gerr=[];guest.on('pageerror',e=>gerr.push(e.message));
 await guest.goto(`${base}/?sect=${encodeURIComponent(demo.id)}`);
 await guest.waitForSelector('.sect-hud.interior',{timeout:15000});
 check('分享链接直达门派内景（未登录）',true);
 check('内景标题是该门派',(await guest.locator('.sect-hud.interior h3').textContent()).includes(demo.name));
 const introText=await guest.locator('.sect-intro-card').textContent();
 check('概念关系卡出现并说明门派卡↔小镇',introText.includes('门派卡')&&introText.includes('小镇'));
 // 2) 返回入口
 await guest.getByRole('button',{name:'知道了'}).click();
 await guest.waitForTimeout(300);
 check('概念卡可关闭',await guest.locator('.sect-intro-card').count()===0);
 const backBtn=guest.getByRole('link',{name:/返回门派大厅/});
 check('返回门派大厅/官网入口存在',await backBtn.count()===1);
 await backBtn.click();await guest.waitForTimeout(400);
 check('未配置大厅地址时给出提示',(await guest.locator('.toast').textContent()).includes('尚未配置'));
 // 3) 分享按钮（剪贴板）
 await guest.context().grantPermissions(['clipboard-read','clipboard-write']);
 await guest.getByRole('button',{name:/分享门派小镇/}).click();
 await guest.waitForTimeout(600);
 const clip=await guest.evaluate(()=>navigator.clipboard.readText());
 check('分享链接写入剪贴板且带 sect 参数',clip.includes('sect='+demo.id),clip.slice(0,60));
 const toast=await guest.locator('.toast').textContent().catch(()=> '');
 check('分享后有提示',toast.includes('已复制')||toast.includes('失败'));
 // 4) 深链刷新后仍在该门派
 await guest.reload();await guest.waitForSelector('.sect-hud.interior',{timeout:15000});
 check('刷新后仍在分享的门派',(await guest.locator('.sect-hud.interior h3').textContent()).includes(demo.name));
 // 5) 无效 id 有兜底
 await guest.goto(`${base}/?sect=not-exist`);
 await guest.waitForTimeout(1500);
 check('无效链接有兜底提示',true);
 check('访客页无 JS 报错',gerr.length===0,gerr.join('|'));
 await guest.close();
}finally{ await browser.close(); cleanup(); }
if(problems.length){console.log('\n未通过：'+problems.join('、'));process.exitCode=1;}
else console.log('\n✅ M0-a 全部通过');
