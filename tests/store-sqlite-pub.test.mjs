import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// 管理域 SQLite 后端：数据写在临时目录，不碰工程内的 data/。
// 这里镜像 tests/publication.test.mjs / budget.test.mjs / sects.test.mjs 的核心断言——
// 两个后端必须行为一致，改任一侧都应保持两边全绿。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sqlite-pub-'));
process.env.ATOM_DATA_DIR=tmp;
process.env.ATOM_STORE='sqlite';
const pub=await import('../server/publication-store.mjs');
const budget=await import('../server/budget.mjs');
const sects=await import('../server/sects.mjs');
const embeddings=await import('../server/embeddings.mjs');
const {SectSource}=await import('../server/sects-source.mjs');
const {migratePubFromJson}=await import('../server/store-sqlite-pub.mjs');

const env={ATOM_DAILY_BUDGET:'1',ATOM_DAILY_CALL_LIMIT:'100',ATOM_MAX_CONCURRENT:'2',ATOM_PRICE_IN_PER_MTOK:'2',ATOM_PRICE_OUT_PER_MTOK:'4'};

test('sqlite publication overrides: withdraw removes a work from every public read and audits it', () => {
 const result=pub.setWorkStatus('funskills--ecom-video','已撤回','运营甲','sqlite withdraw');
 assert.equal(result.stateVersion,1);
 assert.equal(pub.liveFindWork('funskills--ecom-video'),null);
 assert.equal(pub.anyLiveWork('funskills--ecom-video').publicationStatus,'已撤回');
 assert.equal(pub.livePublishedWorks().length,37);
 const [event]=pub.getAudit(1);
 assert.equal(event.action,'withdraw_work');
 assert.equal(event.actor,'运营甲');
 assert.equal(event.before.works['funskills--ecom-video'].publicationStatus,'已发布');
 assert.equal(event.after.works['funskills--ecom-video'].publicationStatus,'已撤回');
 // 状态在库文件里（不是进程内缓存）：新开连接也能读到。
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='withdraw_work'").get().n,1);
 const overrides=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='pub_overrides'").get().value);
 assert.equal(overrides.works['funskills--ecom-video'].publicationStatus,'已撤回');
 db.close();
 // 恢复，避免影响本文件后续断言。
 pub.setWorkStatus('funskills--ecom-video','已发布','运营甲');
});

test('sqlite audit: newest first, and rollback restores from an audit event', () => {
 pub.setEditionStatus('funskills','已撤回','运营甲','sqlite withdraw edition');
 const withdrawn=pub.getAudit(1)[0];
 assert.equal(withdrawn.action,'withdraw_edition');
 assert.equal(pub.livePublishedWorks().length,0);
 const rolled=pub.rollbackEdition('funskills',withdrawn.id,'运营甲');
 assert.ok(rolled.stateVersion>withdrawn.stateVersion||rolled.stateVersion>=3);
 assert.equal(pub.livePublishedWorks().length,38,'回滚后全部恢复');
 const events=pub.getAudit(50);
 assert.ok(events[0].time>=events[events.length-1].time,'合并后按时间倒序');
 assert.ok(events.some(e=>e.action==='rollback_edition'));
});

test('sqlite budget: reserve/settle dedupe, day aggregation, and thresholds', () => {
 const r=budget.reserve('req-1',{in:1000,out:0},env);
 assert.ok(r.ok);
 assert.equal(budget.dayUsage().calls,0,'预留不计调用次数');
 const s=budget.settle('req-1',{model:'m',tokens:{in:1000,out:500},status:'ok'},env);
 assert.equal(s.record.status,'ok');
 // 1000 in * 2/M + 500 out * 4/M = 0.004
 assert.equal(budget.dayUsage().cost,0.004);
 assert.equal(budget.dayUsage().calls,1);
 const again=budget.settle('req-1',{model:'m',tokens:{in:9999,out:9999},status:'ok'},env);
 assert.equal(again.duplicate,true);
 assert.equal(budget.dayUsage().cost,0.004,'重复结算不重复计费');
 const dup=budget.reserve('req-1',{in:1000,out:0},env);
 assert.equal(dup.duplicate,true);
 assert.equal(budget.dayUsage().cost,0.004);
 budget.reserve('req-2',{in:100,out:0},env);
 budget.settle('req-2',{model:'m',tokens:{in:0,out:0},status:'error'},env);
 assert.equal(budget.dayUsage().calls,1,'失败请求不计次数');
 // 并发上限 2：两个在飞（req-1 已结算释放，req-2 已结算释放；连占两个再看第三个）。
 const a=budget.reserve('req-c1',{in:10,out:0},env),b=budget.reserve('req-c2',{in:10,out:0},env);
 assert.ok(a.ok&&b.ok);
 const c=budget.reserve('req-c3',{in:10,out:0},env);
 assert.equal(c.ok,false);
 assert.equal(c.reason,'concurrency');
 // 账本落在库里（重启不清费用）：新开连接直接读表。
 // req-1/req-2/req-c1/req-c2 四条；req-c3 被并发挡掉，不建记录（与 JSON 版一致）。
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM budget_requests').get().n,4);
 assert.ok(db.prepare('SELECT cost FROM budget_days').get().cost>0);
 db.close();
 // 日预算 100%：把当天费用顶到预算以上，新的预留被 stop。
 budget.settle('req-c1',{model:'m',tokens:{in:1000000,out:0},status:'ok'},env);
 budget.settle('req-c2',{model:'m',tokens:{in:1000000,out:0},status:'ok'},env);
 assert.equal(budget.gate(env).level,'stop');
 const stopped=budget.reserve('req-stop',{in:10,out:0},env);
 assert.equal(stopped.ok,false);
 assert.equal(stopped.reason,'daily-budget');
});

test('sqlite sects: demo sects, create persists, and only the founder manages', () => {
 assert.equal(sects.loadSects().length,8,'内置 8 个演示门派');
 const sect=sects.createSect({name:'sqlite派',slogan:'事务加持',intro:'测试',style:'jianghu'},{id:'u-founder',name:'创派祖师'});
 assert.ok(sects.findSect(sect.id),'建派后立即可查');
 assert.equal(sects.loadSects().length,9,'写进了库（不是进程内数组）');
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 const doc=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='sects'").get().value);
 assert.ok(doc.sects.some(s=>s.id===sect.id),'门派库在 kv 表里');
 db.close();
 assert.throws(()=>sects.createSect({name:'sqlite派',slogan:'',intro:'',style:'jianghu'},{id:'u-x',name:'x'}),/已被占用/);
 sects.addElder(sect.id,{name:'长老甲',title:'执法长老'},{id:'u-founder',name:'创派祖师'});
 sects.addDisciple(sect.id,{name:'弟子甲',title:'大师兄'},{id:'u-founder',name:'创派祖师'});
 const managed=sects.findSect(sect.id);
 assert.equal(managed.elders.length,1);
 assert.equal(managed.disciples.length,1);
 assert.throws(()=>sects.addElder(sect.id,{name:'长老乙',title:'长老'},{id:'u-other',name:'路人甲'}),/只有门派创始人/);
});

test('sqlite sects-source: cache and overlay live in kv, not in files', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sqlite-src2-'));
 let calls=0;
 const source=new SectSource({base:'http://127.0.0.1:1',dataDir:dir,fetchImpl:async()=>{
  calls++;
  return {ok:true,headers:{get:()=>'application/json'},json:async()=>({sects:[{id:'remote-1',sectName:'远程派',tagline:'同步来的',leader:{name:'远程掌门'},members:[{name:'远程长老',title:'执法长老'},{name:'远程弟子',title:'大师兄'}]}]})};
 }});
 source.remote=[];source.overlay={created:[],patches:{}};
 const snapshot=await source.refresh({force:true});
 assert.equal(calls,1);
 assert.ok(snapshot.some(s=>s.id==='remote-1'),'远程门派进快照');
 // 缓存与覆盖层落在 SQLite（kv），临时目录里不应出现 JSON 文件。
 assert.ok(!fs.existsSync(path.join(dir,'sects-cache.json')),'缓存不写文件');
 assert.ok(!fs.existsSync(path.join(dir,'sects-overlay.json')),'覆盖层不写文件');
 const restored=new SectSource({base:'http://127.0.0.1:1',dataDir:dir,fetchImpl:async()=>{throw new Error('不应再请求');}});
 const cold=restored.restore();
 assert.ok(cold.some(s=>s.id==='remote-1'),'冷启动从库内缓存恢复');
});

test('sqlite embeddings: cache lives in the embeddings table and only new rows are written', async () => {
 embeddings.configureEmbeddings({ATOM_EMBEDDING_BASE_URL:'http://127.0.0.1:1',ATOM_EMBEDDING_API_KEY:'k',ATOM_EMBEDDING_MODEL:'m'});
 assert.equal(embeddings.embeddingsEnabled(),true);
 let calls=0;
 const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({data:[{embedding:[1,0,0]},{embedding:[0,1,0]}]})};};
 const first=await embeddings.embedTexts(['文本甲','文本乙'],{fetchImpl});
 assert.deepEqual(first,[[1,0,0],[0,1,0]]);
 assert.equal(calls,1);
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM embeddings').get().n,2,'两条向量落表');
 db.close();
 // 第二次：缓存命中，不再请求提供方。
 const second=await embeddings.embedTexts(['文本甲'],{fetchImpl});
 assert.deepEqual(second,[[1,0,0]]);
 assert.equal(calls,1,'缓存命中不请求');
 // 排著作权重用缓存。
 const ranked=await embeddings.rankByEmbedding('文本甲',[{t:'文本甲'},{t:'文本乙'}],x=>x.t,{fetchImpl});
 assert.deepEqual(ranked.map(x=>x.t),['文本甲']);
 assert.equal(calls,1);
});

test('sqlite import workbench: applyImport adds an edition and audits it atomically', () => {
 // 复用 e2e 用过的夹具形状：整赛事快照进导入层，落地为草稿，发布后才公开。
 const payload={editions:[{
  id:'demo-cup',title:'演示杯',subtitle:'SQLite 导入',description:'导入闭环',
  tracks:['全部'],
  works:[{id:'demo-cup--w1',title:'导入作品一',author:'甲',track:'全部',tagline:'一句话',description:'介绍',poster:'/works/funskills/ecom-video.jpg',thumb:'/works/funskills/thumbs/ecom-video.jpg'}],
 }]};
 const report=pub.importCheck(payload);
 assert.equal(report.ok,true,JSON.stringify(report.issues));
 assert.equal(report.totals.new,1);
 const applied=pub.applyImport(payload,'运营甲','sqlite import');
 assert.ok(applied.stateVersion>0);
 // 与 JSON 版同语义：作品落地为草稿（未显式指定时），赛事级默认已发布。
 assert.equal(pub.anyLiveWork('demo-cup--w1').publicationStatus,'草稿','未显式指定状态的作品落地为草稿');
 assert.equal(pub.livePublishedWorks().length,38,'草稿作品不进公开读取');
 const [event]=pub.getAudit(1);
 assert.equal(event.action,'import_editions');
 assert.equal(event.actor,'运营甲');
 assert.equal(event.after.newWorks,1);
 // 覆盖层与审计同一个事务：库里两份内容一致。
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 const overrides=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='pub_overrides'").get().value);
 assert.ok(overrides.added.some(e=>e.id==='demo-cup'),'导入层在覆盖层里');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='import_editions'").get().n,1);
 db.close();
 // 发布作品后公开可见；撤回后一致消失（与 JSON 版同语义）。
 pub.setWorkStatus('demo-cup--w1','已发布','运营甲');
 assert.equal(pub.livePublishedWorks().length,39,'38 + 导入发布的 1 件');
 assert.ok(pub.liveFindWork('demo-cup--w1'));
 pub.setWorkStatus('demo-cup--w1','已撤回','运营甲');
 assert.equal(pub.liveFindWork('demo-cup--w1'),null);
 assert.equal(pub.livePublishedWorks().length,38);
});

test('migratePubFromJson imports overrides, audit, ledger, sects and caches idempotently', () => {
 const src=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sqlite-pubsrc-'));
 fs.writeFileSync(path.join(src,'publication-overrides.json'),JSON.stringify({stateVersion:9,editions:{funskills:{publicationStatus:'已撤回',contentVersion:3}},works:{},added:[]}));
 fs.writeFileSync(path.join(src,'audit-log.json'),JSON.stringify([{id:'audit-old',actor:'old',action:'withdraw_work',targetId:'x',scope:'work',before:{},after:{},time:'2026-01-01T00:00:00.000Z',note:''}]));
 fs.writeFileSync(path.join(src,'usage-ledger.json'),JSON.stringify({requests:{'req-old':{requestId:'req-old',status:'ok',tokens:{in:10,out:5},cost:.001,model:'m',time:'2026-01-01T00:00:00.000Z'}},days:{'2026-01-01':{cost:.001,calls:1}}}));
 fs.writeFileSync(path.join(src,'sects.json'),JSON.stringify({sects:[{id:'sect-old',name:'老门派',slogan:'旧',intro:'旧数据',style:'jianghu',founderId:'u-1',founderName:'老掌门',elders:[],disciples:[]}]}));
 fs.writeFileSync(path.join(src,'sects-overlay.json'),JSON.stringify({created:[],patches:{'sect-old':{slogan:'改过的'}}}));
 fs.writeFileSync(path.join(src,'sects-cache.json'),JSON.stringify({syncedAt:1,sects:[]}));
 fs.writeFileSync(path.join(src,'embedding-cache.json'),JSON.stringify({'abc123':[1,2,3]}));
 const first=migratePubFromJson({dataDir:src});
 assert.equal(first.overrides,true);
 assert.equal(first.audit,1);
 assert.equal(first.budgetRequests,1);
 assert.equal(first.budgetDays,1);
 assert.equal(first.sects,true);
 assert.equal(first.sectsOverlay,true);
 assert.equal(first.sectsCache,true);
 assert.equal(first.embeddings,1);
 // 幂等：重跑不重复。
 const second=migratePubFromJson({dataDir:src});
 assert.equal(second.audit,1,'审计按 id 覆盖写');
 assert.equal(second.budgetRequests,1,'预算请求按 id 覆盖写');
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_events').get().n>=1,true);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM embeddings WHERE hash='abc123'").get().n,1);
 db.close();
 // 迁移来的数据各模块读得到：审计（含旧单文件）、预算当天聚合、门派库。
 const events=pub.getAudit(500);
 assert.ok(events.some(e=>e.id==='audit-old'),'旧单文件审计可读');
 const sectsAll=sects.loadSects();
 assert.ok(sectsAll.some(s=>s.id==='sect-old'),'迁移的门派可读');
});
