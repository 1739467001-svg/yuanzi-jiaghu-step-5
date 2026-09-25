import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const apiBase=process.env.TEST_API_BASE||base;
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.waitForSelector('.scene-pin.player');await page.waitForTimeout(1500);
 // 首访引导：首次进入出现三步卡片，跳过后不再出现。
 const onboard=page.locator('.onboard-card');
 assert.equal(await onboard.count(),1,'首访引导出现');
 assert.match(await onboard.textContent(),/第 1 \/ 3 步/);
 await page.getByRole('button',{name:'下一步'}).click();assert.match(await page.locator('.onboard-card').textContent(),/第 2 \/ 3 步/);
 await page.getByRole('button',{name:'跳过引导'}).click();assert.equal(await page.locator('.onboard-card').count(),0,'跳过后消失');
 await page.reload();await page.waitForSelector('.scene-pin.player');assert.equal(await page.locator('.onboard-card').count(),0,'刷新后不再出现');
 await page.screenshot({path:'artifacts/town-desktop.png'});
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 assert.equal(await page.locator('.work-card').count(),38);
 assert.equal(await page.locator('.exhibiting-badge').count(),8);
 assert.match(await page.locator('.result-line').textContent(),/公共展陈 展区 1\/\d+/);
 assert.match(await page.locator('.version-line').textContent(),/editions-snapshot-v1/);
 await page.getByRole('button',{name:/数智星光展/}).click();assert.equal(await page.locator('.work-card').count(),18);
 assert.equal(await page.locator('.exhibiting-badge').count(),0);
 await page.getByRole('button',{name:/繁星之夜/}).click();
 // 星火计划：真实赛事介绍（主办方/赛程/奖项）。
 await page.getByRole('button',{name:/星火计划/}).click();
 assert.match(await page.locator('.edition-facts').textContent(),/上海市大数据社会应用研究会/,'主办方来自手册');
 assert.match(await page.locator('.edition-schedule').textContent(),/线下七天集训营/,'两阶段赛程');
 assert.match(await page.locator('.edition-awards').textContent(),/全场总冠军/,'奖项设置');
 assert.equal(await page.locator('.work-card').count(),0,'作品资料核对前不展示');
 await page.getByRole('button',{name:/繁星之夜/}).click();
 await page.getByRole('textbox',{name:'搜索作品'}).fill('StoryMap');assert.equal(await page.locator('.work-card').count(),1);
 await page.locator('.work-card').click();await page.getByRole('button',{name:'收藏到手札'}).click();assert.equal(await page.getByRole('button',{name:'已收入手札'}).count(),1);
 const link=page.url();await page.reload();await page.getByRole('dialog',{name:'StoryMap'}).waitFor();assert.equal(page.url(),link);
 await page.getByRole('dialog',{name:'StoryMap'}).getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'关闭窗口'}).click();
 // 小镇导览：从侧栏进入，逐站前进并结束。
 await page.getByRole('button',{name:'小镇导览'}).click();
 await page.waitForSelector('.tour-card',{timeout:10000});
 assert.match(await page.locator('.tour-card').textContent(),/原子江湖 · 导览/,'导览从品牌介绍开始');
 await page.getByRole('button',{name:'下一站'}).click();
 assert.match(await page.locator('.tour-card').textContent(),/江湖茶楼/,'第一站：茶楼');
 await page.getByRole('button',{name:'下一站'}).click();assert.match(await page.locator('.tour-card').textContent(),/共创工坊/,'第二站：工坊');
 await page.getByRole('button',{name:'上一站'}).click();assert.match(await page.locator('.tour-card').textContent(),/江湖茶楼/,'可回退');
 await page.getByRole('button',{name:'结束导览'}).click();assert.equal(await page.locator('.tour-card').count(),0,'导览可结束');
 await page.getByRole('button',{name:'返回小镇',exact:true}).click();
 // AI 私聊是成员能力：先注册名帖账号，再回到本地演示模式聊天（账号保持登录）。
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.getByRole('dialog',{name:'创建侠客名帖'}).waitFor();
 await page.getByRole('textbox',{name:'名帖昵称'}).fill(`主测少侠-${Date.now().toString(36)}`);
 await page.getByRole('textbox',{name:'密码'}).fill('password123');
 await page.getByRole('button',{name:'创建并进入联机世界'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('联机世界'),null,{timeout:20000});
 await page.getByRole('button',{name:'切换世界模式'}).click();
 await page.waitForFunction(()=>document.querySelector('.world-status')?.textContent.includes('进入联机'),null,{timeout:15000});
 await page.getByRole('button',{name:'和阿原聊聊'}).click();await page.getByRole('checkbox').check();
 await page.getByRole('textbox',{name:'聊天消息'}).fill('我喜欢内容创作');await page.getByRole('button',{name:'发送消息',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.chat-work').length>0);
 await page.waitForTimeout(500); // 等待记忆写入账号（服务端异步持久化）
 await page.getByRole('button',{name:'你还记得我吗？',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-messages').textContent.includes('在你允许保存'));
 await page.getByRole('button',{name:'关闭窗口'}).click();
 // 关注：AI 面板关注一位侠客 → 手札“我的关注”可见 → 取消关注后消失。
 await page.getByRole('button',{name:'查看所有侠客'}).click();
 await page.locator('.people-row').first().getByRole('button',{name:/关注/}).click();
 await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('已关注'),null,{timeout:10000});
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:/游历手札/}).click();await page.getByRole('button',{name:'我的关注',exact:true}).click();
 assert.equal(await page.locator('.follows-list article').count(),1,'手札显示关注的 AI 侠客');
 assert.match(await page.locator('.follows-list').textContent(),/AI 侠客/,'关注分类正确');
 await page.locator('.follows-list article').getByRole('button',{name:'取消关注'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.follows-list article').length===0,null,{timeout:10000});
 await page.getByRole('button',{name:'收藏作品',exact:true}).click();
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:/游历手札/}).click();await page.getByRole('button',{name:'私人记忆',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'删除这条记忆'}).count(),1);await page.getByRole('button',{name:'删除这条记忆'}).click();
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'和阿原聊聊'}).click();await page.getByRole('button',{name:'你还记得我吗？',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-messages').textContent.includes('我还没有你授权保存'));
 // Arrow keys in the input must not switch exhibits or move the player.
 await page.getByRole('textbox',{name:'聊天消息'}).fill('输入框中的测试');await page.getByRole('textbox',{name:'聊天消息'}).press('ArrowLeft');assert.ok(await page.getByRole('dialog',{name:'与阿原聊聊'}).isVisible());
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'小镇设置',exact:true}).click();const nick=`行走的原子-${Date.now().toString(36)}`;await page.getByRole('textbox',{name:'我的昵称'}).fill(nick);await page.getByRole('button',{name:/保存(本地形象|名帖)/}).click();await page.getByRole('button',{name:'虚拟校园',exact:true}).click();await page.getByRole('button',{name:'关闭窗口'}).click();assert.match(await page.getByRole('button',{name:'定制我的侠客'}).textContent(),new RegExp(nick));
 await page.getByRole('button',{name:'切换夜景',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/town-night.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.waitForSelector('.scene-pin.player');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);await mobile.screenshot({path:'artifacts/town-mobile.png'});await mobile.getByRole('button',{name:'武林大会',exact:true}).click();assert.equal(await mobile.locator('.work-card').count(),38);await mobile.screenshot({path:'artifacts/gallery-mobile.png'});await mobile.getByRole('textbox',{name:'搜索作品'}).fill('no-result-000');assert.equal(await mobile.locator('.work-card').count(),0);
 await mobile.getByRole('button',{name:'关闭窗口'}).click();
 const skipOnboard=await mobile.getByRole('button',{name:'跳过引导'}).isVisible().catch(()=>false);if(skipOnboard)await mobile.getByRole('button',{name:'跳过引导'}).click();
 // 手机端底部抽屉：折叠只露主行动点，展开显示完整侧栏，再收起。
 await mobile.locator('.sheet-handle').click();await mobile.waitForSelector('.right-rail.sheet-open',{timeout:5000});
 assert.ok(await mobile.locator('.rail-section.happenings').isVisible(),'展开后显示江湖此刻');
 await mobile.locator('.sheet-handle').click();await mobile.waitForFunction(()=>!document.querySelector('.right-rail.sheet-open'),null,{timeout:5000});
 // 平板竖屏：无横向溢出，侧栏正常显示。
 const tablet=await browser.newPage({viewport:{width:834,height:1112}});tablet.on('pageerror',e=>errors.push(e.message));await tablet.goto(base);await tablet.waitForSelector('.scene-pin.player');assert.equal(await tablet.evaluate(()=>document.documentElement.scrollWidth),834);assert.ok(await tablet.locator('.right-rail').isVisible(),'平板端侧栏可见');await tablet.screenshot({path:'artifacts/town-tablet.png'});
 const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};});await fallback.goto(base);await fallback.getByRole('button',{name:'打开比赛展示馆'}).click();await fallback.getByRole('button',{name:'进入展示馆',exact:true}).click();assert.equal(await fallback.locator('.work-card').count(),38);
 if(process.env.TEST_STATIC_DEMO!=='true'){const response=await page.request.post(apiBase+'/api/chat',{data:null});assert.equal(response.status(),400);}
 if(process.env.TEST_STATIC_DEMO!=='true'){
  const degraded=await browser.newPage();degraded.on('pageerror',e=>errors.push(e.message));
  await degraded.addInitScript(()=>{const original=window.fetch;window.fetch=(input,...args)=>String(input).includes('/api/content/catalog')?Promise.reject(new Error('offline')):original(input,...args);});
  await degraded.goto(base);await degraded.waitForFunction(()=>document.querySelector('.version-line')?.textContent.includes('本地快照降级'),null,{timeout:20000});
 // 降级提示是 3.5 秒 toast；持久信号看版本行，作品阅读不中断。
 await degraded.getByRole('button',{name:'武林大会',exact:true}).click();
 assert.equal(await degraded.locator('.work-card').count(),38);
 assert.match(await degraded.locator('.version-line').textContent(),/本地快照降级/);
 }
 // 运营后台：撤回一件作品 → 公开详情 410、目录减少 → 重新发布后恢复。
 if(process.env.TEST_STATIC_DEMO!=='true'){
  const admin=await browser.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(base+'/admin.html');
  await admin.getByRole('textbox',{name:'本地运营令牌'}).fill('atom-local-demo');
  await admin.getByRole('button',{name:'进入后台'}).click();
  await admin.getByRole('button',{name:'作品管理'}).click();
  await admin.getByRole('textbox',{name:'搜索作品'}).fill('电商视频全能版');
  const row=admin.locator('table.grid tbody tr').first();
  await row.getByRole('button',{name:'撤回'}).click();
  await admin.waitForTimeout(400);
  const withdrawn=await page.request.get(apiBase+'/api/works/funskills--ecom-video');
  assert.equal(withdrawn.status(),410,'撤回后公开详情必须返回 410');
  await page.goto(base);await page.waitForSelector('.scene-pin.player');
  await page.getByRole('button',{name:'武林大会',exact:true}).click();
  assert.equal(await page.locator('.work-card').count(),37,'撤回后目录减少一件');
  await admin.bringToFront();
  await admin.getByRole('textbox',{name:'搜索作品'}).fill('电商视频全能版');
  await admin.locator('table.grid tbody tr').first().getByRole('button',{name:'发布'}).click();
  await admin.waitForTimeout(400);
  const restored=await page.request.get(apiBase+'/api/works/funskills--ecom-video');
  assert.equal(restored.status(),200,'重新发布后公开详情恢复');
  await admin.getByRole('button',{name:'审计日志'}).click();
  assert.ok(await admin.locator('table.grid tbody tr').count()>=2,'审计日志记录撤回与发布');
 // 赛事导入工作台：填入示例 → 预检 → 确认导入（草稿）→ 发布 → 展厅与检索可见 → 审计留痕。
 const importRun=Date.now().toString(36);
 // 载荷显式带发布状态：导入即公开（不带则落地为草稿，需另行发布）。
 const importEdition={id:'e2e-cup-'+importRun,title:'e2e导入赛事-'+importRun,subtitle:'验收导入闭环',description:'由 e2e 通过运营后台导入的赛事。',tracks:['验收赛道'],publicationStatus:'已发布',
  works:[{id:'e2e-cup-'+importRun+'--demo',slug:'demo',title:'e2e导入作品',author:'验收机器人',track:'验收赛道',tagline:'导入闭环',description:'后台导入生成的验收作品。',tags:['e2e'],publicationStatus:'已发布',poster:'/works/funskills/ecom-video.jpg',thumb:'/works/funskills/thumbs/ecom-video.jpg'}]};
 await admin.getByRole('button',{name:'赛事导入'}).click();
 await admin.getByRole('textbox',{name:'赛事 JSON'}).fill(JSON.stringify({editions:[importEdition]}));
 await admin.getByRole('button',{name:'预检导入'}).click();
 await admin.waitForFunction(()=>document.querySelector('.import-report .muted')?.textContent.includes('新增'),null,{timeout:10000});
 assert.match(await admin.locator('.import-report .muted').textContent(),/校验通过/,'预检通过');
 await admin.getByRole('button',{name:'确认导入'}).click();
 await admin.waitForFunction(()=>document.body.textContent.includes('导入完成'),null,{timeout:10000});
 const imported=await page.request.get(apiBase+'/api/works/'+importEdition.works[0].id);
 assert.equal(imported.status(),200,'导入即公开：详情可见');
 assert.match(await imported.text(),/e2e导入作品/,'详情内容为导入数据');
 // 赛事管理中出现该赛事（后台可见全部状态）。
 await admin.getByRole('button',{name:'赛事管理'}).click();
 const editionRow=admin.locator('table.grid tbody tr',{hasText:'e2e导入赛事-'+importRun});
 await editionRow.first().waitFor({timeout:10000});
 assert.ok(await editionRow.first().isVisible(),'后台赛事管理出现导入的赛事');
 const liveCatalog=await (await page.request.get(apiBase+'/api/content/catalog')).json();
 assert.ok(liveCatalog.editions.some(e=>e.id===importEdition.id),'公开目录包含导入的赛事');
 assert.ok(liveCatalog.editions.flatMap(e=>e.works).some(w=>w.id===importEdition.works[0].id),'公开目录包含导入的作品');
 // 撤回导入的赛事：各公开入口一致消失（与既有撤回语义一致）。
 await admin.getByRole('button',{name:'赛事管理'}).click();
 await admin.locator('table.grid tbody tr',{hasText:'e2e导入赛事-'+importRun}).first().getByRole('button',{name:'撤回'}).click();
 await admin.waitForTimeout(600);
 assert.equal((await page.request.get(apiBase+'/api/works/'+importEdition.works[0].id)).status(),410,'撤回后导入作品从公开入口消失');
  // 运行状态：房间占用、模型预算、进程状态（运维可见性）。
  await admin.getByRole('button',{name:'运行状态'}).click();
  await admin.waitForSelector('.ops-panel',{timeout:10000});
  assert.match(await admin.locator('.ops-panel').textContent(),/联机世界/,'房间占用可见');
  assert.match(await admin.locator('.ops-panel').textContent(),/模型与预算/,'预算可见');
  assert.match(await admin.locator('.ops-panel').textContent(),/服务进程/,'进程状态可见');
  await admin.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: 38/18 works, search, bookmarking, deep-link reload, chat retrieval, opt-in memory, deletion, input focus, customization, night mode, mobile, no-WebGL fallback, invalid API input, admin withdraw/republish with audit. No page exceptions.');
}finally{await browser.close();}
