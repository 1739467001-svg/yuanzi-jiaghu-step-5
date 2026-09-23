// 联机世界双浏览器验收：双账号位置一致、邀请私聊、第三方只看到“交谈中”、同账号接管。
// 需要本地 dev/preview 服务已启动（含 /ws/world）。
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {SEATS} from '../src/world/config.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
async function newPage(context,label){
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(`${label}: ${e.message}`));
 return page;
}
async function enterOnline(page){
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 // 等待登录态从本地令牌恢复（顶栏显示账号名），再按需切换。
 await page.waitForFunction(()=>document.querySelector('.profile-button')?.textContent.includes('少侠')===false&&document.querySelector('.mode-switch')&&!document.querySelector('.mode-switch').textContent.includes('登录'),null,{timeout:15000});
 const status=(await page.locator('.world-status').textContent())||'';
 if(!/联机世界|连接中|重连中|已被接管|房间已满/.test(status))await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:15000});
 await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:15000});
}
// 走到茶楼附近：等到真正进入任一茶桌的入座判定半径（服务端要求 ≤6）且已经停稳。
// 只判距离不够——上一步“点击地面移动”可能本就停在茶桌旁，会在出发前就满足条件。
async function walkToTeahouse(page){
 let last=null,stable=0;
 for(let i=0;i<150;i++){
  const p=await page.evaluate(()=>{const s=window.__atomOnlineSelf;return s?{x:s.x,z:s.z}:null;});
  if(p){
   const near=SEATS.some(st=>Math.hypot(p.x-st.x,p.z-st.z)<5);
   if(last&&Math.hypot(p.x-last.x,p.z-last.z)<0.05)stable++;else stable=0;
   if(near&&stable>=3)return;
   last=p;
  }
  await page.waitForTimeout(200);
 }
 throw new Error('走到茶楼附近超时');
}
// 打开茶楼面板：标钉每 120ms 重投影，单击偶尔会落空或被遮罩吃掉——重试并带诊断。
async function openTeaPanel(page,label=''){
 for(let i=0;i<4;i++){
  const pin=page.locator('.scene-pin',{hasText:'江湖茶楼'});
  if(await pin.count()){
   try{await pin.first().click({timeout:5000});}catch{}
   try{await page.waitForSelector('.seat-picker',{timeout:5000});return true;}catch{}
  }
  await page.waitForTimeout(600);
 }
 const dump=await page.evaluate(()=>({
  dialog:document.querySelector('.dialog')?.getAttribute('aria-label')||null,
  pins:[...document.querySelectorAll('.scene-pin')].map(p=>p.textContent),
 }));
 throw new Error(`打开茶楼面板失败${label?`（${label}）`:''}：${JSON.stringify(dump)}`);
}
// 入座：茶楼里可能已有 AI 侠客落座、座位状态随时变化——挑离自己最近的空位点击，
// 被抢先（占用/超距）就换下一个，直到入座成功。
async function sitAtTeahouse(page){
 for(let attempt=0;attempt<8;attempt++){
  const label=await page.evaluate(seats=>{
   const self=window.__atomOnlineSelf;if(!self)return null;
   const free=[...document.querySelectorAll('.seat-chip')].filter(c=>!c.classList.contains('taken')&&!c.classList.contains('mine'));
   const withDist=free.map(c=>{const s=seats.find(x=>x.label===(c.querySelector('small')?.textContent||''));return {label:c.querySelector('small')?.textContent,d:s?Math.hypot(self.x-s.x,self.z-s.z):99};}).filter(x=>x.d<5).sort((a,b)=>a.d-b.d);
   return withDist.length?withDist[0].label:null;
  },SEATS);
  if(!label)return false;
  await page.locator('.seat-chip',{hasText:label}).first().click();
  try{await page.waitForFunction(()=>document.querySelector('.seat-chip.mine'),null,{timeout:4000});return true;}catch{}
 }
 return false;
}
// 注册账号并直接进入联机世界（名帖昵称即账号名）。
async function registerAccount(page,name){
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 const skipOnboard=page.getByRole('button',{name:'跳过引导'});if(await skipOnboard.isVisible().catch(()=>false))await skipOnboard.click();
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(name);
 await page.getByRole('textbox',{name:'密码'}).fill('demo-pass-123');
 await page.getByRole('button',{name:'创建并进入联机世界'}).click();
 await page.waitForFunction(()=>window.__atomOnlinePlayers!==undefined,null,{timeout:20000});
}
async function clickGround(page,x,y){
 const box=await page.locator('.webgl-host').boundingBox();
 await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
}
// 画布上有名牌与提示浮层，依次尝试候选点直到角色确实移动。
async function walkSomewhere(page){
 const box=await page.locator('.webgl-host').boundingBox();
 for(const [fx,fy] of [[.3,.5],[.32,.45],[.28,.55],[.35,.42],[.26,.6]]){
  const before=await page.evaluate(()=>({...window.__atomOnlineSelf}));
  await page.mouse.click(box.x+box.width*fx,box.y+box.height*fy);
  await page.waitForTimeout(1800);
  const after=await page.evaluate(()=>({...window.__atomOnlineSelf}));
  const moved=Math.hypot(after.x-before.x,after.z-before.z);
  if(moved>1.2)return {from:before,to:after};
 }
 throw new Error('点击地面后角色没有移动');
}
const run=Date.now().toString(36);
const NAME_A=`联机甲-${run}`,NAME_B=`联机乙-${run}`,NAME_C=`联机丙-${run}`;
try{
 const contextA=await browser.newContext({viewport:{width:1280,height:800}});
 const contextB=await browser.newContext({viewport:{width:1280,height:800}});
 const a=await newPage(contextA,'A'),b=await newPage(contextB,'B');
 // A 的本机预置一条旧版私人记忆：登录后应出现迁移选择（不静默归入账号）。
 await a.addInitScript(()=>localStorage.setItem('atom-jianghu-v1:memories',JSON.stringify([{id:'old-1',agentId:'moyu',text:'我喜欢写作',time:Date.now(),source:'你主动表达的兴趣'}])));
 await registerAccount(a,NAME_A);await registerAccount(b,NAME_B);
 await enterOnline(a);await enterOnline(b);
 // 0. 本机旧记忆迁移选择。
 await a.getByRole('dialog',{name:'发现本机旧记忆'}).waitFor();
 await a.getByRole('button',{name:'迁移到账号'}).click();
 await a.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('已迁移 1 条'),null,{timeout:10000});
 await a.getByRole('button',{name:/游历手札/}).click();await a.getByRole('button',{name:'私人记忆',exact:true}).click();
 assert.match(await a.locator('.memory-list').textContent(),/我喜欢写作/,'迁移后的记忆出现在手札');
 await a.getByRole('button',{name:'关闭窗口'}).click();
 // 1. 双账号互见，且各自身份稳定。
 await a.waitForFunction(n=>(window.__atomOnlinePlayers||[]).some(p=>p.name===n),NAME_B,{timeout:10000});
 await b.waitForFunction(n=>(window.__atomOnlinePlayers||[]).some(p=>p.name===n),NAME_A,{timeout:10000});
 assert.match(await a.locator('.map-caption').textContent(),/10 位侠客在此相聚/,'房间内为 8 位 AI + 2 位真人');
 // 表情招呼：A 发表情，B 收到公开表情广播（3D 气泡 + 测试接缝）。
 await a.getByRole('button',{name:'打招呼'}).click();
 await b.waitForFunction(()=>(window.__atomOnlineEmotes||[]).some(e=>e.emote==='wave'),null,{timeout:10000});
 // 2. A 点击地面移动，B 看到的位置与服务端一致（A03）。
 await walkSomewhere(a);
 await a.waitForTimeout(1200);
 const [selfA,viewOfA]=await Promise.all([a.evaluate(()=>window.__atomOnlineSelf),b.evaluate(n=>(window.__atomOnlinePlayers||[]).find(p=>p.name===n),NAME_A)]);
 assert.ok(viewOfA,'B 的快照里有 A');
 assert.ok(Math.hypot(viewOfA.x-selfA.x,viewOfA.z-selfA.z)<1.5,`双账号位置一致（A:${selfA.x},${selfA.z} B看到:${viewOfA.x},${viewOfA.z}）`);
 // 2.5 茶楼共坐：A 入座 → B 看到占用与昵称 → B 也入座 → A 起身释放座位。
  await openTeaPanel(a);
 await a.getByRole('button',{name:'走过去'}).click(); // 先走到茶楼附近（面板会收起）
 await walkToTeahouse(a);
  await openTeaPanel(a); // 重新打开面板
 assert.ok(await sitAtTeahouse(a),'A 入座');
  await openTeaPanel(b);
 const aChipOnB=b.locator('.seat-chip.taken').filter({hasText:NAME_A});
 await aChipOnB.first().waitFor({timeout:10000});
 assert.ok(await aChipOnB.first().isDisabled(),'B 看到 A 占了哪个座位（含昵称，不可抢）');
 await b.getByRole('button',{name:'走过去'}).click();
 await walkToTeahouse(b);
  await openTeaPanel(b);
 assert.ok(await sitAtTeahouse(b),'B 也入座');
 const bChipOnA=a.locator('.seat-chip.taken').filter({hasText:NAME_B});
 await bChipOnA.first().waitFor({timeout:10000});
 assert.equal(await a.locator('.seat-chip.mine').count(),1,'A 看到两人同坐茶楼');
 await a.getByRole('button',{name:'起身'}).click();
 await a.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:10000});
 assert.equal(await a.locator('.seat-chip.mine').count(),0,'A 已起身');
 assert.equal(await b.locator('.seat-chip.taken').filter({hasText:NAME_A}).count(),0,'B 看到 A 的座位已释放');
 await a.getByRole('button',{name:'关闭窗口'}).click();await b.getByRole('button',{name:'关闭窗口'}).click();
 // 2.6 茶楼常有 AI 侠客落座：占用公开（含昵称）、不能抢座、3D 呈现坐姿。
 const AI_NAMES=['阿原','知微','青禾','墨语','行舟','小满','朝露','星河'];
 // B 先起身：茶楼可能已被 AI 坐满，A 起身后又站在原位挡着最后一个空座——
 // 腾出 B 的座位，AI 才有地方落座（B 起身不影响后续验收）。
 await openTeaPanel(b);
 if(await b.locator('.seat-chip.mine').count()){
  await b.getByRole('button',{name:'起身'}).click();
  await b.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
 }
 await b.getByRole('button',{name:'关闭窗口'}).click();
 await a.waitForFunction(()=>(window.__atomOnlinePlayers||[]).some(p=>p.ai&&p.seat),null,{timeout:120000});
  await openTeaPanel(a);
 const aiChip=a.locator('.seat-chip.taken').filter({hasText:new RegExp(AI_NAMES.join('|'))});
 await aiChip.first().waitFor({timeout:10000});
 assert.match(await aiChip.first().textContent(),new RegExp(AI_NAMES.join('|')),'茶楼里有 AI 侠客落座，占用显示其昵称');
 assert.ok(await aiChip.first().isDisabled(),'AI 占着的座位真人不能抢');
 await a.locator('.seat-grid').scrollIntoViewIfNeeded();
 await a.screenshot({path:'artifacts/tea-ai-guest.png'});
 await a.getByRole('button',{name:'关闭窗口'}).click();
 await a.waitForTimeout(1200);
 await a.getByRole('button',{name:'回到我的角色'}).click();
 await a.waitForTimeout(1500);
 for(let i=0;i<8;i++){await a.getByRole('button',{name:'放大地图'}).click();await a.waitForTimeout(200);}
 await a.waitForTimeout(1500);
 await a.screenshot({path:'artifacts/tea-ai-guest-scene.png'});
 // 2.7 茶桌同桌：A、B 坐同一张桌 → 同桌区列出对方 → 一键邀请 → 接受后坐着聊；入座进入活动流。
 await a.getByRole('button',{name:'重置视角'}).click();
 await a.waitForTimeout(1500);
 // B 可能还在 2.5 的座位上：先起身，拿到干净起点。
 await openTeaPanel(b);
 if(await b.locator('.seat-chip.mine').count()){
  await b.getByRole('button',{name:'起身'}).click();
  await b.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
 }
 await b.getByRole('button',{name:'关闭窗口'}).click();
 // 找一张至少有两个空位的桌子（AI 侠客随时会落座，抢占前先让真人坐下）。
 const pickTableForTwo=()=>a.evaluate(seats=>{
  const occupied=new Set((window.__atomOnlinePlayers||[]).filter(p=>p.seat).map(p=>p.seat));
  for(const table of ['tea-a','tea-b']){
   const free=seats.filter(s=>s.id.slice(0,5)===table&&!occupied.has(s.id));
   if(free.length>=2)return free;
  }
  return null;
 },SEATS);
 const sitAt=async(page,label)=>{
  await page.locator('.seat-chip:not(.taken)',{hasText:label}).first().click();
  await page.waitForFunction(()=>document.querySelector('.seat-chip.mine'),null,{timeout:6000});
 };
 let table=null;
 for(let attempt=0;attempt<10&&!table;attempt++){
  const free=await pickTableForTwo();
  if(!free){await a.waitForTimeout(2000);continue;}
  await walkToTeahouse(b);
  await openTeaPanel(b);
  if(await b.locator('.seat-chip.mine').count()){
   await b.getByRole('button',{name:'起身'}).click();
   await b.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
  }
  try{await sitAt(b,free[0].label);}catch{await b.getByRole('button',{name:'关闭窗口'}).click().catch(()=>{});continue;}
  // B 坐下后同一桌可能还剩空位；没有就换桌。
  const freeForA=await a.evaluate(({seats,bSeat})=>{
   const occupied=new Set((window.__atomOnlinePlayers||[]).filter(p=>p.seat).map(p=>p.seat));
   return seats.filter(s=>s.id.slice(0,5)===bSeat.slice(0,5)&&!occupied.has(s.id))[0]||null;
  },{seats:SEATS,bSeat:free[0].id});
  if(!freeForA){await b.getByRole('button',{name:'起身'}).click();await b.getByRole('button',{name:'关闭窗口'}).click().catch(()=>{});continue;}
  await walkToTeahouse(a);
  await openTeaPanel(a);
  if(await a.locator('.seat-chip.mine').count()){
   await a.getByRole('button',{name:'起身'}).click();
   await a.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
  }
  try{
   await sitAt(a,freeForA.label);
   // 入座立即进入活动流（此刻它一定是最新的一条；快照只显示最近几条，晚了会被新事件挤掉）。
   await a.waitForFunction(n=>[...document.querySelectorAll('.happenings .event p')].some(p=>(p.textContent||'').includes(n)),NAME_A,{timeout:8000});
   table={aSeat:freeForA};
  }catch{await a.getByRole('button',{name:'关闭窗口'}).click().catch(()=>{});continue;}
 }
 assert.ok(table,'A、B 坐同一张茶桌');
 // 同桌区列出对方（真人也可能是 AI 侠客，一并列出）。
 const mateRow=a.locator('.table-mate',{hasText:NAME_B});
 await mateRow.first().waitFor({timeout:10000});
 assert.match(await mateRow.first().textContent(),new RegExp(NAME_B),'同桌区显示同桌的人');
 await a.locator('.seat-table').scrollIntoViewIfNeeded();
 await a.screenshot({path:'artifacts/tea-table-mate.png'});
 // 一键邀请同桌：B 收到邀请 → 接受 → 两人坐着聊。
 await mateRow.first().getByRole('button').click();
 await b.getByRole('dialog',{name:'聊天邀请'}).waitFor({timeout:10000});
 await b.getByRole('button',{name:'接受邀请'}).click();
 await a.getByRole('dialog',{name:`与${NAME_B}私聊`}).waitFor({timeout:10000});
 await a.getByRole('button',{name:'离开会话'}).click();
 await b.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('会话已结束'),null,{timeout:10000});
 // 两人起身，把座位还给茶楼。
 await openTeaPanel(a);await a.getByRole('button',{name:'起身'}).click();
 await a.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
 await a.getByRole('button',{name:'关闭窗口'}).click();
 await openTeaPanel(b);await b.getByRole('button',{name:'起身'}).click();
 await b.waitForFunction(()=>document.querySelector('.seat-chip.mine')===null,null,{timeout:8000});
 await b.getByRole('button',{name:'关闭窗口'}).click();
 // 3. A 邀请 B 私聊；B 接受后互通；第三方只看到“交谈中”。
 await a.locator('.nearby-avatars button',{hasText:NAME_B}).click();
 await a.getByRole('button',{name:'发起私聊'}).click();
 await b.getByRole('dialog',{name:'聊天邀请'}).waitFor();
 await b.getByRole('button',{name:'接受邀请'}).click();
 await a.getByRole('dialog',{name:`与${NAME_B}私聊`}).waitFor();
 await b.getByRole('dialog',{name:`与${NAME_A}私聊`}).waitFor();
 await a.getByRole('textbox',{name:'私聊消息'}).fill('乙，今晚一起看展吗');
 await a.getByRole('button',{name:'发送私聊'}).click();
 await b.waitForFunction(()=>document.querySelector('.chat-messages')?.textContent.includes('今晚一起看展吗'),null,{timeout:10000});
 // 4. 第三方：看不到私聊内容，只能看到“交谈中”，且无法向忙碌者发起邀请。
 const contextC=await browser.newContext({viewport:{width:1280,height:800}});
 const c=await newPage(contextC,'C');
 await registerAccount(c,NAME_C);
 // 房间里还有 8 位服务端 AI 侠客与 2 位真人。
 await c.waitForFunction(()=>(window.__atomOnlinePlayers||[]).length===10,null,{timeout:15000});
 const chatFlags=await c.evaluate(()=>(window.__atomOnlinePlayers||[]).map(p=>({name:p.name,chat:p.chat,ai:p.ai})));
 assert.equal(chatFlags.filter(p=>p.ai).length,8,'第三方看到 8 位 AI 侠客');
 const busy=chatFlags.filter(p=>!p.ai);
 assert.ok(busy.every(p=>p.chat===true),'第三方看到私聊双方都在交谈中');
 assert.equal(await c.locator('.chat-tag').count(),2,'侧栏显示两个“交谈中”徽标（内容不可见）');
 assert.ok(chatFlags.filter(p=>p.ai).every(p=>p.chat===false),'未受邀的 AI 不在交谈中');
 assert.ok(!(await c.locator('body').textContent()).includes('今晚一起看展吗'),'第三方读不到私聊正文');
 await c.locator('.nearby-avatars button',{hasText:NAME_A}).click();
 assert.equal(await c.getByRole('button',{name:'发起私聊'}).isDisabled(),true,'忙碌中的侠客不可被邀请');
 await c.getByRole('button',{name:'关闭窗口'}).click();
 // 5. A 离开会话，B 收到结束通知。
 await a.getByRole('button',{name:'离开会话'}).click();
 await b.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('会话已结束'),null,{timeout:10000});
 // 6. 与 AI 侠客私聊：立即开始，回复只引用已发布作品并附作品卡片。
 await a.locator('.nearby-avatars button',{hasText:'阿原'}).click();
 await a.getByRole('button',{name:'发起私聊'}).click();
 await a.getByRole('dialog',{name:'与阿原私聊'}).waitFor();
 await a.getByRole('textbox',{name:'私聊消息'}).fill('推荐效率工具作品');
 await a.getByRole('button',{name:'发送私聊'}).click();
 await a.waitForFunction(()=>document.querySelectorAll('.chat-work').length>0,null,{timeout:15000});
 assert.match(await a.locator('.chat-mode').textContent(),/AI 侠客/);
 // 第三方看不到与 AI 的私聊内容。
 assert.ok(!(await c.locator('body').textContent()).includes('为你找到了'),'第三方读不到与 AI 的私聊回复');
 await a.getByRole('button',{name:'离开会话'}).click();
 // 7. 同账号第二个标签页接管：A2 进入后 A 停止控制。
 const a2=await newPage(contextA,'A2');
 await enterOnline(a2);
 await a.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('已被接管'),null,{timeout:15000});
 assert.match(await a.locator('.world-status').textContent(),/已被接管/);
 assert.deepEqual(errors,[],`页面异常: ${errors.join('; ')}`);
 console.log('PASS: 本机记忆迁移、双账号互见与位置一致、茶楼共坐与 AI 侠客落座、同桌一键相邀、邀请/接受/私聊、第三方只见交谈中、与 AI 侠客私聊并打开作品卡片、离开通知、同账号接管。');
}finally{await browser.close();}
if(errors.length)process.exitCode=1;
