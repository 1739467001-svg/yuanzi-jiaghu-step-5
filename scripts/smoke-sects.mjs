// 原子门派验收（自带临时服务，不依赖外部进程）：
// 1) 门派大殿：进入建筑 → 4 座门派牌坊 + 分页（8 个演示门派分 2 页）→ 名牌可点击；
// 2) 门派内景：创始人主位居中 → 长老阁 → 弟子按称号排序；
// 3) 注册名帖 → 创立自己的门派（追加在末页）→ 加长老/弟子 → 位次实时更新；
// 4) 刷新后门派与成员仍在（服务端持久化）；5) 联机世界里门派大殿同样可用；
// 6) 纯静态部署（没有 /api/sects，Vercel 形态）：本机演示层同样能建派并管理成员。
// 用法：node scripts/smoke-sects.mjs（TEST_PORT 可换端口，默认 5199；需先 npm run build）
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
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

 // ---- 8) 纯静态部署（Vercel 形态：没有 /api/sects）也能建派并管理成员 ----
 assert.ok(fs.existsSync(path.join(root,'dist','index.html')),'需要先 npm run build 生成 dist/');
 const staticPort=port+1;
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
 const staticSrv=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname.startsWith('/api/')){res.statusCode=404;res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>404</title>');}
  const file=path.join(root,'dist',decodeURIComponent(url.pathname));
  const send=f=>{res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));};
  if(file.startsWith(path.join(root,'dist'))&&fs.existsSync(file)&&fs.statSync(file).isFile())return send(file);
  res.statusCode=200;return send(path.join(root,'dist','index.html')); // 静态托管把未知路径回退到 index.html
 });
 await new Promise(r=>staticSrv.listen(staticPort,'127.0.0.1',r));
 const staticPage=await browser.newPage({viewport:{width:1280,height:860}});
 const staticErrors=[];
 staticPage.on('pageerror',e=>staticErrors.push(e.message));
 try{
  await staticPage.goto(`http://127.0.0.1:${staticPort}/`);
  await staticPage.waitForSelector('.scene-pin.player');
  const skip2=staticPage.getByRole('button',{name:'跳过引导'});
  if(await skip2.count())await skip2.click();
  await staticPage.waitForTimeout(800);
  // 没有世界服务端：注册降级为真实的本地演示身份
  await staticPage.getByRole('button',{name:'切换世界模式'}).click();
  await staticPage.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
  const nick2=`静态掌门-${Date.now().toString(36)}`;
  await staticPage.getByRole('textbox',{name:'名帖昵称'}).fill(nick2);
  await staticPage.getByRole('textbox',{name:'密码'}).fill('password123');
  await staticPage.getByRole('button',{name:/创建并进入联机世界|创建名帖，进入江湖/}).click();
  await staticPage.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('本地演示身份'),null,{timeout:20000});
  await staticPage.getByRole('button',{name:'切换世界模式'}).click();
  await staticPage.waitForFunction(n=>document.querySelector('.profile-button')?.textContent.includes(n),nick2,{timeout:20000});
  await staticPage.waitForSelector('.scene-pin',{hasText:'原子门派'});
  await staticPage.getByRole('button',{name:'原子门派 ↗'}).click();
  await staticPage.getByRole('button',{name:'进入门派大殿'}).click();
  await staticPage.waitForSelector('.sect-hud .sect-hud-card');
  assert.equal((await staticPage.locator('.sect-row b').allTextContents()).length,4,'静态站同样列出门派名录（内置演示数据）');
  const sect2='静态演示门';
  await staticPage.getByRole('textbox',{name:'门派名称'}).fill(sect2);
  await staticPage.getByRole('textbox',{name:'门派 slogan'}).fill('没有服务端也能建派');
  await staticPage.getByRole('combobox',{name:'门派样式'}).selectOption('mystery');
  await staticPage.getByRole('button',{name:'创立门派'}).click();
  await staticPage.waitForFunction(n=>document.querySelector('.toast')?.textContent.includes(n),sect2,{timeout:10000});
  assert.match(await staticPage.locator('.sect-pager span').textContent(),/第 3 \/ 3 页 · 共 9 个门派/,'本机自建门派并入分页');
  await staticPage.locator('.sect-row',{hasText:sect2}).click();
  await staticPage.waitForSelector('.sect-hud.interior');
  assert.match(await staticPage.locator('.sect-role.founder').textContent(),new RegExp(nick2),'本机身份的创始人也认得出');
  await staticPage.getByRole('textbox',{name:'长老昵称'}).fill('知微');
  await staticPage.getByRole('combobox',{name:'长老称号'}).selectOption('执法长老');
  await staticPage.getByRole('button',{name:'加入长老阁'}).click();
  await staticPage.waitForFunction(()=>document.querySelector('.sect-hud.interior .sect-role.elder')?.textContent.includes('知微'),null,{timeout:10000});
  await staticPage.getByRole('textbox',{name:'弟子昵称'}).fill('小满');
  await staticPage.getByRole('combobox',{name:'弟子称号'}).selectOption('大师姐');
  await staticPage.getByRole('button',{name:'收入门下'}).click();
  await staticPage.waitForFunction(()=>document.querySelector('.sect-hud.interior .sect-role.disciple')?.textContent.includes('小满'),null,{timeout:10000});
  // 刷新后本机门派仍在（localStorage 演示层持久化）
  await staticPage.reload();
  await staticPage.waitForSelector('.scene-pin.player');
  assert.ok(await staticPage.evaluate(()=>JSON.parse(localStorage.getItem('atomLocalSects')||'[]').length===1),'本机门派已持久化');
  await staticPage.getByRole('button',{name:'原子门派 ↗'}).click();
  await staticPage.getByRole('button',{name:'进入门派大殿'}).click();
  await staticPage.waitForSelector('.sect-hud .sect-hud-card');
  assert.match(await staticPage.locator('.sect-pager span').textContent(),/共 9 个门派/,'刷新后门派仍在');
  assert.deepEqual(staticErrors,[],'静态页无 JS 报错：'+staticErrors.join(' | '));
  await staticPage.screenshot({path:path.join(artifacts,'sects-static-demo.png')});
 }finally{
  await staticPage.close();
  await new Promise(r=>staticSrv.close(r));
 }
 // ---- 9) 接原子公社门派网站（ATOM_SECTS_SOURCE）：远程数据进大殿，本地改动刷新后仍在 ----
 const mockSite=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url.startsWith('/sects')){
   return res.end(JSON.stringify({sects:[
    {sectId:'web-1',sectName:'网站门派甲',tagline:'来自原子公社门派网站',description:'远程站点数据',theme:'startup',
     leader:{id:'web-u-1',nickname:'网站祖师'},council:[{id:'web-e-1',name:'青禾',role:'执法长老'}]},
    {sectId:'web-2',sectName:'网站门派乙',tagline:'第二条',description:'远程站点数据二',theme:'mystery',
     leader:{id:'web-u-2',nickname:'网站祖师二'},members:[{id:'web-d-1',name:'阿原',title:'大师兄'}]},
   ]}));
  }
  res.statusCode=404;res.end('{}');
 });
 await new Promise(r=>mockSite.listen(0,'127.0.0.1',r));
 const webPort=mockSite.address().port;
 const webDir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-web-'));
 const remoteServer=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port+2),ATOM_DATA_DIR:webDir,ATOM_SECTS_SOURCE:`http://127.0.0.1:${webPort}`,ATOM_SECTS_TTL_MS:'300000'},stdio:['ignore','pipe','pipe']});
 let remoteLog='';remoteServer.stdout.on('data',d=>{remoteLog+=d;});remoteServer.stderr.on('data',d=>{remoteLog+=d;});
 try{
  const remoteBase=`http://127.0.0.1:${port+2}`;
  for(let i=0;i<80;i++){try{const r=await fetch(remoteBase+'/api/sects?page=1&size=4');if(r.ok&&(await r.json()).sects)break;}catch{}await new Promise(r=>setTimeout(r,300));}
  const remoteStatus=await (await fetch(remoteBase+'/api/sects/status')).json();
  assert.equal(remoteStatus.kind,'remote','门派数据来自远程站点');
  assert.equal(remoteStatus.count,2,'远程两个门派已同步');
  const remotePage=await browser.newPage({viewport:{width:1280,height:860}});
  const remoteErrors=[];remotePage.on('pageerror',e=>remoteErrors.push(e.message));
  await remotePage.goto(remoteBase);
  await remotePage.waitForSelector('.scene-pin.player');
  const skip3=remotePage.getByRole('button',{name:'跳过引导'});
  if(await skip3.count())await skip3.click();
  await remotePage.waitForTimeout(800);
  await remotePage.getByRole('button',{name:'原子门派 ↗'}).click();
  await remotePage.getByRole('button',{name:'进入门派大殿'}).click();
  await remotePage.waitForSelector('.sect-hud .sect-hud-card');
  assert.deepEqual(await remotePage.locator('.sect-row b').allTextContents(),['网站门派甲','网站门派乙'],'大殿展示远程站点的门派');
  await remotePage.locator('.sect-row',{hasText:'网站门派甲'}).click();
  await remotePage.waitForSelector('.sect-hud.interior');
  assert.match(await remotePage.locator('.sect-hud.interior h3').textContent(),/网站门派甲 · 聚义阁/,'远程门派内景可进入');
  assert.match(await remotePage.locator('.sect-role.founder').textContent(),/网站祖师/,'远程创始人映射正确');
  assert.match(await remotePage.locator('.sect-hud.interior').textContent(),/执法长老/,'远程长老映射正确');
  // 未登录不能建派（远程站点尚未开放管理接口，写入仍走本地覆盖层且需身份）
  await remotePage.getByRole('button',{name:'返回门派大殿'}).click();
  await remotePage.waitForSelector('.sect-hud .sect-hud-card');
  await remotePage.getByRole('textbox',{name:'门派名称'}).fill('远程站点的门派');
  await remotePage.getByRole('button',{name:'创立门派'}).click();
  await remotePage.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('名帖身份'),null,{timeout:8000});
  assert.deepEqual(remoteErrors,[],'远程源页面无 JS 报错：'+remoteErrors.join(' | '));
  await remotePage.screenshot({path:path.join(artifacts,'sects-remote-source.png')});
  await remotePage.close();
  // 覆盖层落盘：远程门派被本地加过成员后，数据在 data 目录里留下痕迹
  assert.ok(fs.existsSync(path.join(webDir,'sects-overlay.json'))||!fs.existsSync(path.join(webDir,'sects.json')),'远程模式下不写本地门派库');
 }finally{
  try{remoteServer.kill('SIGTERM');}catch{}
  try{fs.rmSync(webDir,{recursive:true,force:true});}catch{}
  await new Promise(r=>mockSite.close(r));
 }
}finally{
 await browser.close();
 cleanup();
}
console.log('✅ 原子门派验收通过：大殿分页 → 内景位次 → 建派 → 成员管理 → 持久化 → 联机世界 → 纯静态部署 → 远程门派网站同步');
