import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 发布状态写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-pub-'));
process.env.ATOM_DATA_DIR=tmp;

const {getLiveCatalog,getStateVersion,livePublishedWorks,liveQueryWorks,liveFindWork,anyLiveWork,setEditionStatus,setWorkStatus,rollbackEdition,getAudit,checkEditionPublishable,importDryRun,stablePage} = await import('../server/publication-store.mjs');

test('baseline live catalog matches the bundled snapshot', () => {
 const catalog=getLiveCatalog();
 assert.equal(catalog.editions.length,3);
 assert.equal(livePublishedWorks().length,56);
 assert.equal(getStateVersion(),0);
});

test('publish check blocks editions with missing media or private fields', () => {
 const broken=checkEditionPublishable({id:'x',title:'',description:'',tracks:[],works:[{id:'x--a',title:'A',author:'',track:'',tagline:'',description:'',poster:'/works/x/a.jpg',thumb:'/works/x/a.jpg',wechat:'secret'}]});
 assert.equal(broken.ok,false);
 assert.ok(broken.issues.some(i=>i.includes('标题或介绍')));
 assert.ok(broken.issues.some(i=>i.includes('私人字段')));
 const real=checkEditionPublishable(getLiveCatalog().editions.find(e=>e.id==='funskills'));
 assert.equal(real.ok,true,JSON.stringify(real.issues));
});

test('withdrawing a work removes it from every public read and records an audit event', () => {
 const result=setWorkStatus('funskills--ecom-video','已撤回','tester','e2e withdraw');
 assert.equal(result.stateVersion,1);
 assert.equal(liveFindWork('funskills--ecom-video'),null);
 assert.equal(anyLiveWork('funskills--ecom-video').publicationStatus,'已撤回');
 assert.equal(liveQueryWorks().length,55);
 assert.equal(liveQueryWorks({q:'电商视频全能版'}).length,0);
 const [event]=getAudit(1);
 assert.equal(event.action,'withdraw_work');
 assert.equal(event.actor,'tester');
 assert.equal(event.before.works['funskills--ecom-video'].publicationStatus,'已发布');
 assert.equal(event.after.works['funskills--ecom-video'].publicationStatus,'已撤回');
 assert.ok(event.after.works['funskills--ecom-video'].contentVersion>event.before.works['funskills--ecom-video'].contentVersion);
});

test('withdrawing an edition hides all of its works until rollback restores them', () => {
 setEditionStatus('funskills','已撤回','tester','e2e withdraw edition');
 assert.equal(liveQueryWorks().length,18);
 assert.equal(liveQueryWorks({editionId:'funskills'}).length,0);
 const withdrawEvent=getAudit(10).find(e=>e.action==='withdraw_edition');
 const rolled=rollbackEdition('funskills',withdrawEvent.id,'tester');
 assert.equal(rolled.stateVersion,3);
 // 回滚到“撤回赛事”之前的状态：赛事恢复发布，此前已撤回的单件作品保持撤回（55 条）。
 assert.equal(liveQueryWorks().length,55);
 assert.equal(liveQueryWorks({editionId:'funskills'}).length,37);
 const events=getAudit(10);
 assert.equal(events.filter(e=>e.action==='rollback_edition').length,1);
 // 审计只追加：撤回事件仍然在日志里。
 assert.ok(events.some(e=>e.action==='withdraw_edition'));
 // 单件作品重新发布后恢复 56 条，供后续分页测试使用完整目录。
 setWorkStatus('funskills--ecom-video','已发布','tester','e2e republish');
 assert.equal(liveQueryWorks().length,56);
});

test('invalid statuses are rejected without writing anything', () => {
 const before=getStateVersion();
 assert.throws(()=>setWorkStatus('funskills--ecom-video','已上线'));
 assert.throws(()=>setEditionStatus('funskills','已收官'));
 assert.throws(()=>setWorkStatus('funskills--nope','已发布'));
 assert.equal(getStateVersion(),before);
});

test('stable pagination keeps catalog order and clamps bounds', () => {
 const items=livePublishedWorks();
 const first=stablePage(items,{limit:10});
 assert.equal(first.total,56);
 assert.equal(first.items.length,10);
 assert.deepEqual(first.items.map(w=>w.id),items.slice(0,10).map(w=>w.id));
 const second=stablePage(items,{limit:10,offset:10});
 assert.deepEqual(second.items.map(w=>w.id),items.slice(10,20).map(w=>w.id));
 assert.deepEqual(stablePage(items,{limit:10,offset:1000}).items,[]);
 assert.equal(stablePage(items,{limit:9999}).items.length,56);
});

test('import check reports candidate diffs without writing publication state', () => {
 const before=getStateVersion();
 const report=importDryRun();
 assert.ok(report.editions.length>=2);
 const funskills=report.editions.find(e=>e.id==='funskills');
 // 基线已包含来源全部记录：dry-run 应报告 0 条新增、0 条缺失。
 assert.ok(funskills.items.every(i=>i.status!=='new'&&i.status!=='missing'));
 assert.equal(getStateVersion(),before,'导入检查不改变发布状态');
 assert.equal(fs.existsSync(path.join(tmp,'publication-overrides.json')),true,'只有此前的运营动作写过覆盖层');
});

// ---------- 赛事导入工作台（阶段 32） ----------
const {importCheck,applyImport}=await import('../server/publication-store.mjs');
const sampleEdition=(id='demo-cup')=>({
 id,title:'示范赛事',subtitle:'导入闭环验证',description:'由导入工作台写入的示例赛事。',
 tracks:['示范赛道'],
 works:[{id:id+'--sample',slug:'sample',title:'示例作品',author:'运营示范',track:'示范赛道',tagline:'验证导入闭环',description:'后台导入生成。',tags:['示例'],poster:'/works/funskills/ecom-video.jpg',thumb:'/works/funskills/thumbs/ecom-video.jpg'}],
});
test('import check reports new/updated/unchanged/missing without writing state', () => {
 const before=getStateVersion();
 const report=importCheck({editions:[sampleEdition()]});
 assert.equal(report.ok,true,JSON.stringify(report.issues));
 assert.equal(report.totals.new,1);
 assert.equal(report.editions[0].isNew,true);
 assert.equal(getStateVersion(),before,'预检不写状态');
 // 既有赛事：同一载荷第二次预检应为"未变化"。
 applyImport({editions:[sampleEdition()]},'tester','导入示范赛事');
 const again=importCheck({editions:[sampleEdition()]});
 assert.equal(again.totals.unchanged,1);
 assert.equal(again.totals.new,0);
 assert.equal(again.editions[0].isNew,false);
});

test('applyImport adds a new edition, bumps the version, and writes an audit event', () => {
 const before=getStateVersion();
 const editionsBefore=getLiveCatalog().editions.length;
 const result=applyImport({editions:[sampleEdition('demo-cup-b')]},'tester','导入示范赛事');
 assert.equal(result.stateVersion,before+1,'stateVersion 递增');
 assert.equal(getLiveCatalog().editions.length,editionsBefore+1,'新赛事进入实时目录');
 const live=anyLiveWork('demo-cup-b--sample');
 assert.ok(live,'新作品可被检索');
 // 导入不等于发布：未显式指定状态的作品与赛事落地为草稿，由运营在后台发布。
 assert.equal(live.publicationStatus,'草稿','默认草稿');
 const audit=getAudit(5).find(e=>e.action==='import_editions');
 assert.ok(audit,'写入审计');
 assert.match(audit.targetId,/demo-cup/);
 assert.equal(audit.after.newWorks,1);
 // 载荷显式指定发布状态时尊重载荷（之后latest审计变为本次，故上面先断言）。
 applyImport({editions:[{...sampleEdition('demo-cup-b'),publicationStatus:'已发布',works:[{...sampleEdition('demo-cup-b').works[0],publicationStatus:'已发布'}]}]},'tester','显式发布');
 assert.equal(anyLiveWork('demo-cup-b--sample').publicationStatus,'已发布','显式状态被尊重');
});

test('applyImport rejects malformed payloads and keeps state untouched', () => {
 const before=getStateVersion();
 const editionsBefore=getLiveCatalog().editions.length;
 assert.throws(()=>applyImport({editions:[]}),/editions 数组/);
 assert.throws(()=>applyImport({}),/editions 数组/);
 // 作品 id 不以赛事 id 开头：规范化会失败，必须在导入前拦下。
 assert.throws(()=>applyImport({editions:[{...sampleEdition(),works:[{...sampleEdition().works[0],id:'wrong--sample'}]}]}),/必须以 demo-cup-- 开头/);
 // 缺媒体文件。
 assert.throws(()=>applyImport({editions:[{...sampleEdition(),works:[{...sampleEdition().works[0],poster:'/works/demo/none.jpg'}]}]}),/文件不存在/);
 assert.equal(getStateVersion(),before,'校验失败不改变状态');
 assert.equal(getLiveCatalog().editions.length,editionsBefore,'校验失败不新增赛事');
});

test('imported edition keeps existing withdrawal overrides for works still present', () => {
 // 先撤回导入赛事里的作品，再用同一快照重新导入：撤回状态必须保留。
 setWorkStatus('demo-cup--sample','已撤回','tester','先撤回');
 assert.equal(anyLiveWork('demo-cup--sample').publicationStatus,'已撤回');
 const result=applyImport({editions:[sampleEdition()]},'tester','重新导入');
 assert.equal(result.report.totals.unchanged,1);
 assert.equal(anyLiveWork('demo-cup--sample').publicationStatus,'已撤回','重新导入不复活已撤回作品');
 // 清理：删除该赛事（覆盖层置空由后续测试无关，这里直接发布回来保持目录干净）。
 setWorkStatus('demo-cup--sample','已发布','tester','清理');
});

test('withdrawing an imported edition hides it and its works from every public read', () => {
 // 阶段 32 补齐：导入层（added）上的赛事也必须响应赛事级状态覆盖。
 const id='demo-cup-wd';
 const edition=sampleEdition(id);
 edition.publicationStatus='已发布';
 edition.works[0].publicationStatus='已发布';
 applyImport({editions:[edition]},'tester','导入待撤回赛事');
 assert.ok(livePublishedWorks().some(w=>w.id===id+'--sample'),'导入并发布后公开可见');
 setEditionStatus(id,'已撤回','tester','撤回导入的赛事');
 assert.ok(!livePublishedWorks().some(w=>w.id===id+'--sample'),'撤回赛事后其作品从公开目录消失');
 const live=anyLiveWork(id+'--sample');
 assert.ok(live&&live.publicationStatus==='已发布','作品自身状态未被改写');
 assert.equal(getLiveCatalog().editions.find(e=>e.id===id).publicationStatus,'已撤回','赛事状态为已撤回');
});
