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
