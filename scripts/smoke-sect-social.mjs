// M2 社交化验收：游客浏览→登录→申请→掌门在管理台通过→申请者成为弟子→公告与加入方式。
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const port=5390;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-m2e2e-'));
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ATOM_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const problems=[];
const check=(name,ok,extra='')=>{console.log((ok?'✅ ':'❌ ')+name+(extra?' → '+extra:''));if(!ok)problems.push(name);};
const cleanup=()=>{try{server.kill('SIGTERM');}catch{}try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}};
process.on('exit',cleanup);
const api=async(p,token)=>{const r=await fetch(base+p,{headers:token?{'x-atom-token':token}:{}});return r.ok?await r.json():null;};
const post=async(p,body,token)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-atom-token':token}:{})},body:JSON.stringify(body)});const t=await r.text();try{return {status:r.status,...JSON.parse(t)};}catch{return {status:r.status,raw:t.slice(0,120)};}};
const register=async(name)=>{const r=await post('/api/auth/register',{name,password:'password123',color:'#b4432f'});return r;};
try{
 for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/sects?page=1&size=1');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 const founder=await register('M2掌门'+Date.now().toString(36).slice(-5));
 const guest=await register('M2少侠'+Date.now().toString(36).slice(-5));
 // 掌门建派
 const made=await post('/api/sects',{name:'M2社交门'+Date.now().toString(36).slice(-4),slogan:'共建',intro:'测试',style:'jianghu'},founder.token);
 check('掌门建派成功',!!made.id,made.name);
 // 外人申请（直接走 API，等于访客点了申请）
 const app1=await post(`/api/sects/${made.id}/apply`,{message:'想学共创'},guest.token);
 check('游客提交申请',app1.status===200&&app1.joined===false,app1.error||'');
 const apps=await api(`/api/sects/${made.id}/applications`,founder.token);
 const pending=(apps?.applications||[]).filter(a=>a.status==='pending');
 check('掌门能看到待处理申请',pending.length===1,'待处理 '+pending.length);
 // 越权：外人不能看申请/审核
 check('外人不能看申请',(await fetch(base+`/api/sects/${made.id}/applications`,{headers:{'x-atom-token':guest.token}})).status===400);
 const deny=await post(`/api/sects/${made.id}/applications/${pending[0].id}`,{decision:'approve'},guest.token);
 check('外人不能审核',deny.status===400,deny.error);
 // 长老可看但不能审
 await post(`/api/sects/${made.id}/elders`,{userId:'u-el',name:'青禾长老',title:'执法长老'},founder.token);
 // 游客重复申请被拒
 const again=await post(`/api/sects/${made.id}/apply`,{message:'再试'},guest.token);
 check('重复申请被拒',again.status===400,again.error);
 // 掌门通过 → 自动入驻
 const decided=await post(`/api/sects/${made.id}/applications/${pending[0].id}`,{decision:'approve'},founder.token);
 check('审核通过后自动入驻为弟子',decided.disciples?.some(d=>d.userId===guest.user.id&&d.title==='弟子'),decided.error||'');
 // 公告：掌门与长老可发
 const n1=await post(`/api/sects/${made.id}/notices`,{text:'本周六举行茶会'},founder.token);
 check('掌门发公告',n1.status===200&&n1.notices?.[0]?.text==='本周六举行茶会',n1.error||'');
 // 加入方式：开放加入 → 第三人点一下即入驻
 const third=await register('M3第三人'+Date.now().toString(36).slice(-5));
 await post(`/api/sects/${made.id}/join-policy`,{policy:'open'},founder.token);
 const joined=await post(`/api/sects/${made.id}/apply`,{},third.token);
 check('开放加入直接入驻',joined.joined===true,'弟子数 '+joined.sect?.disciples?.length);
 // ===== 浏览器：管理台与申请入口 =====
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.goto(base);await page.waitForSelector('.scene-pin.player');
 const skip=page.getByRole('button',{name:'跳过引导'});
 if(await skip.count())await skip.click();
 // 掌门登录
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(founder.user.name);
 await page.getByRole('textbox',{name:'密码'}).fill('password123');
 await page.getByRole('button',{name:/登录，进入江湖/}).click();
 await page.waitForFunction(n=>document.querySelector('.profile-button')?.textContent.includes(n),founder.user.name,{timeout:20000});
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.waitForTimeout(900);
 // 进自己门派
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 await page.getByRole('button',{name:'下一页'}).click();await page.waitForTimeout(400);
 await page.getByRole('button',{name:'下一页'}).click();await page.waitForTimeout(400);
 await page.locator('.sect-row',{hasText:made.name}).first().click();
 await page.waitForSelector('.sect-hud.interior');
 check('管理台出现（掌门）',await page.locator('.sect-console').count()===1);
 check('公告在管理台可见',(await page.locator('.sect-notice').first().textContent()).includes('本周六举行茶会'));
 check('加入方式可选且当前为开放加入',(await page.locator('.sect-policy-row').textContent()).includes('开放加入'));
 const hist=await page.locator('.sect-apply-history').textContent();
 check('申请历史显示已入驻',hist.includes('已入驻'),hist.slice(0,40));
 check('自己的门派里不显示申请入口',await page.locator('.sect-join').count()===0);
 // 少侠视角：访客看到申请入口
 const guestPage=await browser.newPage({viewport:{width:1280,height:800}});
 await guestPage.goto(`${base}/?sect=${made.id}`);
 await guestPage.waitForSelector('.sect-hud.interior',{timeout:15000});
 const joinText=await guestPage.locator('.sect-join').textContent();
 check('访客看到加入入口与当前策略',joinText.includes('加入')&&joinText.includes('开放加入'),joinText.replace(/\n/g,' ').slice(0,40));
 check('访客看不到管理台',await guestPage.locator('.sect-console').count()===0);
 await guestPage.close();
 check('页面无 JS 报错',errs.length===0,errs.join('|'));
 await page.close();
}finally{ await browser.close(); cleanup(); }
if(problems.length){console.log('\n未通过：'+problems.join('、'));process.exitCode=1;}
else console.log('\n✅ M2 全部通过');
