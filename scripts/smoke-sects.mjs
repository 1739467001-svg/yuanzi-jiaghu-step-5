// 原子门派验收（自带临时服务，不依赖外部进程）：
// 1) 门派大殿：进入建筑 → 4 座门派牌坊 + 分页（8 个演示门派分 2 页）→ 名牌可点击；
// 2) 门派内景：创始人主位居中 → 长老阁 → 弟子按称号排序；
// 3) 注册名帖 → 创立自己的门派（追加在末页）→ 加长老/弟子 → 位次实时更新；
// 4) 刷新后门派与成员仍在（服务端持久化）；5) 联机世界里门派大殿同样可用。
// 用法：node scripts/smoke-sects.mjs（TEST_PORT 可换端口，默认 5199）
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const port=Number(process.env.TEST_PORT)||5199;
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sects-'));
const artifacts=path.join(root,'artifacts');
fs.mkdirSync(artifacts,{recursive:true});

const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ATOM_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
let serverLog='';
server.stdout.on('data',d=>{serverLog+=d;});
server.stderr.on('data',d=>{serverLog+=d;});
const cleanup=()=>{try{server.kill('SIGTERM');}catch{}try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}};
process.on('exit',cleanup);

async function waitServer(){
 for(let i=0;i<80;i++){
  try{
   const r=await fetch(base+'/api/sects?page=1&size=4');
   if(r.ok&&(await r.json()).sects)return;
  }catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw new Error('世界服务启动超时：'+serverLog.slice(-400));
}

const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text()+' @ '+(m.location()||{}).url);});
try{
 await waitServer();
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 // 首访引导跳过（不影响门派流程）
 const skip=page.getByRole('button',{name:'跳过引导'});
 if(await skip.count())await skip.click();
 await page.waitForTimeout(800);

 // ---- 1) 进入门派大殿 ----
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 assert.match(await page.locator('.sect-hud-card h3').textContent(),/^原子门派 · 门派大殿$/,'大殿标题');
 assert.match(await page.locator('.sect-pager span').textContent(),/第 1 \/ 2 页 · 共 8 个门派/,'演示门派分 2 页、每页 4 个');
 const firstPageSects=await page.locator('.scene-pin.sect').allTextContents();
 assert.equal(firstPageSects.length,4,'每页 4 座门派牌坊各有名牌');
 assert.deepEqual(firstPageSects,['元气满满派','江湖茶馆分舵','书山小筑','星火工坊'],'第一页门派与演示数据一致');
 await page.screenshot({path:path.join(artifacts,'sects-hall-page1.png')});

 // ---- 2) 进入第一座门派内景（聚义阁位次） ----
 await page.locator('.sect-row',{hasText:'元气满满派'}).click();
 await page.waitForSelector('.sect-hud.interior');
 assert.match(await page.locator('.sect-hud.interior h3').textContent(),/^元气满满派 · 聚义阁$/,'内景标题');
 const introText=await page.locator('.sect-hud.interior').textContent();
 assert.match(introText,/一起把想法做出来/,'slogan 展示');
 const roleOrder=await page.locator('.sect-hud.interior .sect-roles section h4').allTextContents();
 assert.deepEqual(roleOrder,['门派创始人','长老阁（2）','门派弟子（3）'],'聚义阁三段位次：创始人 → 长老阁 → 弟子');
 const elderTitles=await page.locator('.sect-hud.interior .sect-role.elder').allTextContents();
 assert.deepEqual(elderTitles.map(t=>t.replace(/\s+/g,'')),['青禾执法长老','星河传功长老'],'长老称号');
 const discipleTitles=(await page.locator('.sect-hud.interior .sect-role.disciple').allTextContents()).map(t=>t.replace(/\s+/g,''));
 assert.deepEqual(discipleTitles,['阿原大师兄','小满二师姐','朝露弟子'],'弟子按大师兄→二师姐→弟子排序');
 assert.match(await page.locator('.sect-hud.interior .sect-role.founder').textContent(),/阿原/,'创始人主位');
 assert.match(introText,/只有门派创始人可以管理门派/,'非创始人看不到管理台');
 await page.screenshot({path:path.join(artifacts,'sects-interior.png')});

 // ---- 3) 返回大殿并翻到第二页 ----
 await page.getByRole('button',{name:'返回门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 assert.match(await page.locator('.sect-pager span').textContent(),/第 1 \/ 2 页/,'返回后停在第 1 页');
 await page.getByRole('button',{name:'下一页'}).click();
 await page.waitForFunction(()=>document.querySelector('.sect-pager span')?.textContent.includes('第 2 / 2 页'));
 assert.deepEqual(await page.locator('.sect-row b').allTextContents(),['山谷邮局','墨吟诗社','创意杂货铺','远山棋社'],'第二页名录是另外 4 个门派');
 // 翻页后 3D 场景重建：四座牌坊与名牌换成第二页的门派
 await page.waitForFunction(()=>[...document.querySelectorAll('.scene-pin.sect')].map(b=>b.textContent).join()==='山谷邮局,墨吟诗社,创意杂货铺,远山棋社',null,{timeout:10000});
 await page.screenshot({path:path.join(artifacts,'sects-hall-page2.png')});
 await page.locator('.sect-row',{hasText:'墨吟诗社'}).click();
 await page.waitForSelector('.sect-hud.interior');
 assert.match(await page.locator('.sect-hud.interior h3').textContent(),/^墨吟诗社 · 聚义阁$/,'第二页门派同样可进入');
 await page.getByRole('button',{name:'返回门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');

 // ---- 4) 注册名帖后创立自己的门派 ----
 const nick=`掌门-${Date.now().toString(36)}`;
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(nick);
 await page.getByRole('textbox',{name:'密码'}).fill('password123');
 await page.getByRole('button',{name:/创建并进入联机世界|创建名帖，进入江湖/}).click();
 await page.waitForFunction(n=>document.querySelector('.profile-button')?.textContent.includes(n),nick,{timeout:20000});
 await page.getByRole('button',{name:'切换世界模式'}).click(); // 回到本地演示世界（账号保持登录）
 await page.waitForFunction(n=>document.querySelector('.profile-button')?.textContent.includes(n),nick,{timeout:20000});
 // 还在门派大殿里：先回小镇，再从牌坊进大殿（身份保持登录）
 await page.getByRole('button',{name:'返回小镇'}).click();
 await page.waitForSelector('.scene-pin',{hasText:'原子门派'});
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');

 const sectName='原子测试门';
 await page.getByRole('textbox',{name:'门派名称'}).fill(sectName);
 await page.getByRole('textbox',{name:'门派 slogan'}).fill('一次只做一件事');
 await page.getByRole('combobox',{name:'门派样式'}).selectOption('campus');
 await page.getByRole('textbox',{name:'门派介绍'}).fill('验收脚本创建的门派，用来验证创立与成员管理。');
 await page.getByRole('button',{name:'创立门派'}).click();
 await page.waitForFunction(n=>document.querySelector('.toast')?.textContent.includes(n),sectName,{timeout:10000});
 assert.match(await page.locator('.sect-pager span').textContent(),/第 3 \/ 3 页 · 共 9 个门派/,'创立后翻到末页（新门派追加在最后）');
 await page.locator('.sect-row',{hasText:sectName}).click();
 await page.waitForSelector('.sect-hud.interior');
 assert.match(await page.locator('.sect-hud.interior h3').textContent(),new RegExp(sectName+' · 聚义阁'),'自己的门派可进入');
 assert.match(await page.locator('.sect-role.founder').textContent(),new RegExp(nick),'创立者是门派创始人');
 assert.match(await page.locator('.sect-hud.interior').textContent(),/门派管理（仅创始人可见）/,'创始人看到管理台');
 assert.match(await page.locator('.sect-hud.interior').textContent(),/还没有长老/,'新门派没有长老');

 // ---- 5) 创始人管理：加长老、收弟子 ----
 await page.getByRole('textbox',{name:'长老昵称'}).fill('青禾');
 await page.getByRole('combobox',{name:'长老称号'}).selectOption('传功长老');
 await page.getByRole('button',{name:'加入长老阁'}).click();
 await page.waitForFunction(()=>document.querySelector('.sect-hud.interior .sect-role.elder')?.textContent.includes('青禾'),null,{timeout:10000});
 await page.getByRole('textbox',{name:'弟子昵称'}).fill('行舟');
 await page.getByRole('combobox',{name:'弟子称号'}).selectOption('大师兄');
 await page.getByRole('button',{name:'收入门下'}).click();
 await page.waitForFunction(()=>document.querySelector('.sect-hud.interior .sect-role.disciple')?.textContent.includes('行舟'),null,{timeout:10000});
 const roles=await page.locator('.sect-hud.interior .sect-roles section h4').allTextContents();
 assert.deepEqual(roles,['门派创始人','长老阁（1）','门派弟子（1）'],'加人后位次计数更新');
 const adminChips=await page.locator('.sect-admin .sect-chip').allTextContents();
 assert.deepEqual(adminChips.map(t=>t.replace(/\s+/g,'')),['传功长老·青禾','大师兄·行舟'],'管理台名单元数据同步');
 await page.screenshot({path:path.join(artifacts,'sects-my-sect.png')});

 // ---- 6) 刷新后门派与成员仍在（服务端持久化） ----
 await page.reload();
 await page.waitForSelector('.scene-pin.player');
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 assert.match(await page.locator('.sect-pager span').textContent(),/共 9 个门派/,'刷新后门派仍在');
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'下一页'}).click();
  await page.waitForTimeout(400);
 }
 await page.waitForFunction(()=>document.querySelector('.sect-pager span')?.textContent.includes('第 3 / 3 页'));
 await page.locator('.sect-row',{hasText:sectName}).click();
 await page.waitForSelector('.sect-hud.interior');
 assert.match(await page.locator('.sect-hud.interior').textContent(),/传功长老/,'刷新后长老仍在');

 // ---- 7) 联机世界里门派大殿同样可用（点击牌坊进内景） ----
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
 await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:15000});
 // 切换模式前停在自己的门派内景：先逐级返回小镇，再从牌坊进大殿
 await page.getByRole('button',{name:'返回门派大殿'}).click();
 await page.getByRole('button',{name:'返回小镇'}).click();
 await page.waitForSelector('.scene-pin',{hasText:'原子门派'});
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 const onlineSects=await page.locator('.scene-pin.sect').allTextContents();
 assert.equal(onlineSects.length,4,'联机大殿同样列出门派名牌');
 await page.locator('.sect-row',{hasText:onlineSects[0]}).click();
 await page.waitForSelector('.sect-hud.interior');
 assert.match(await page.locator('.sect-hud.interior h3').textContent(),/· 聚义阁$/,'联机世界可进入内景');
 await page.screenshot({path:path.join(artifacts,'sects-online-interior.png')});

 assert.deepEqual(errors,[],'页面无 JS 报错：'+errors.join(' | '));
}finally{
 await browser.close();
 cleanup();
}
console.log('✅ 原子门派验收通过：大殿分页 → 内景位次 → 建派 → 成员管理 → 持久化 → 联机世界');
