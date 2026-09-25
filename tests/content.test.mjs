import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, normalizeCatalog, publishedEditions, publishedWorksOf, allPublishedWorks, findEdition, findWork, queryWorks} from '../src/content/catalog.js';
import {SHARED_EXHIBITION, exhibitionEntries, exhibitionZone, exhibitionZoneCount, isExhibited} from '../src/content/exhibition.js';
import {loadCatalog} from '../src/content/useCatalog.js';
import {MAP_VERSION, CONFIG_VERSION} from '../src/world/config.js';

const work = (editionId, id, extra = {}) => ({id: `${editionId}--${id}`, title: '作品', author: '作者', track: '赛道', tagline: '一句话', description: '正文', tags: [], poster: '/p.jpg', thumb: '/t.jpg', source: '来源', ...extra});
const fixture = (id, works, extra = {}) => ({id, title: '测试赛事', tracks: ['赛道'], works, ...extra});

test('published catalog has stable edition and work IDs', () => {
  assert.equal(catalog.editions.length, 3); // funskills + hackathon + spark
  assert.equal(allPublishedWorks().length, 56);
  assert.equal(new Set(catalog.editions.map(e => e.id)).size, catalog.editions.length);
  assert.equal(new Set(allPublishedWorks().map(w => w.id)).size, allPublishedWorks().length);
  assert.ok(allPublishedWorks().every(w => w.publicationStatus === '已发布' && w.contentVersion >= 1));
  assert.ok(catalog.editions.every(e => ['预告','报名','进行中','评审中','已结束','未知'].includes(e.eventStage)));
});

test('normalization rejects broken contracts and strips private contact fields', () => {
  assert.throws(() => normalizeCatalog([{id: 'x', title: '无作品'}]));
  assert.throws(() => normalizeCatalog([fixture('x', [work('x', 'a')]), fixture('x', [work('x', 'b')])]));
  assert.throws(() => normalizeCatalog([fixture('x', [work('y', 'a')])]));
  assert.throws(() => normalizeCatalog([fixture('x', [work('x', 'a', {publicationStatus: '已上线'})])]));
  assert.throws(() => normalizeCatalog([fixture('x', [], {eventStage: '已收官'})]));
  assert.throws(() => normalizeCatalog([fixture('x', [work('x', 'a', {editionId: 'y'})])]));
  const {editions: [edition]} = normalizeCatalog([fixture('x', [work('x', 'a', {wechat: 'secret', qr: 'qr.png', contact: 'a@b.c'})])]);
  const [cleaned] = edition.works;
  assert.equal(cleaned.wechat, undefined);
  assert.equal(cleaned.qr, undefined);
  assert.equal(cleaned.contact, undefined);
  const {editions: [defaulted]} = normalizeCatalog([fixture('x', [work('x', 'a')])]);
  assert.equal(defaulted.eventStage, '未知');
  assert.equal(defaulted.publicationStatus, '草稿');
  assert.equal(defaulted.works[0].publicationStatus, '草稿');
  assert.equal(defaulted.works[0].contentVersion, 1);
});

test('drafts and withdrawn content never reach public reads', () => {
  const data = [fixture('demo', [
    work('demo', 'live', {publicationStatus: '已发布'}),
    work('demo', 'draft', {publicationStatus: '草稿'}),
    work('demo', 'pending', {publicationStatus: '待审核'}),
    work('demo', 'gone', {publicationStatus: '已撤回'}),
  ])];
  const normalized = normalizeCatalog(data);
  const ids = publishedWorksOf(normalized.editions[0]).map(w => w.id);
  assert.deepEqual(ids, ['demo--live']);
  assert.deepEqual(catalog.editions.flatMap(e => e.works).filter(w => w.id === 'funskills--ecom-video').map(w => w.publicationStatus), ['已发布']);
  assert.equal(findWork('funskills--ecom-video').editionId, 'funskills');
  assert.equal(findWork('missing-work'), undefined);
  assert.equal(findEdition('missing-edition'), undefined);
  assert.ok(publishedEditions().every(e => e.publicationStatus === '已发布'));
});

test('work query supports edition, track and text filters', () => {
  assert.equal(queryWorks({editionId: 'funskills'}).length, 38);
  assert.equal(queryWorks({editionId: 'hackathon', track: '科研实验'}).length, 4);
  const results = queryWorks({q: 'StoryMap'});
  assert.equal(results.length, 1);
  assert.equal(queryWorks({q: 'not-a-real-work'}).length, 0);
  assert.equal(queryWorks().length, 56);
});

test('shared exhibition is fixed by layout version and only cites published works', () => {
  assert.match(SHARED_EXHIBITION.id, /^exp-/);
  assert.ok(SHARED_EXHIBITION.layoutVersion > 0);
  const entries = exhibitionEntries();
  assert.ok(entries.length > 0);
  assert.ok(entries.every(w => w.publicationStatus === '已发布'));
  assert.ok(entries.every(w => findWork(w.id)));
  assert.ok(new Set(entries.map(w => w.id)).size === entries.length);
  assert.equal(exhibitionZoneCount(), Math.ceil(entries.length / SHARED_EXHIBITION.zoneSize));
  const first = exhibitionZone(SHARED_EXHIBITION, 0);
  assert.equal(first.length, SHARED_EXHIBITION.zoneSize);
  assert.ok(first.every(w => isExhibited(w.id)));
  assert.equal(isExhibited('funskills--not-a-work'), false);
  // 展区之间不重叠，索引越界返回空。
  assert.equal(exhibitionZone(SHARED_EXHIBITION, exhibitionZoneCount()).length, 0);
  const shown = new Set(exhibitionEntries().map(w => w.id));
  for (let zone = 0; zone < exhibitionZoneCount(); zone++) for (const w of exhibitionZone(SHARED_EXHIBITION, zone)) assert.ok(shown.has(w.id));
});

test('map and character configs carry comparable versions', () => {
  assert.match(MAP_VERSION, /^[a-z0-9-]+v\d+$/);
  assert.match(CONFIG_VERSION, /^[a-z0-9-]+v\d+$/);
});

test('catalog loader prefers the API, falls back to the bundled snapshot, and stays static when asked', async () => {
  const staticLoad = await loadCatalog({staticDemo: true});
  assert.equal(staticLoad.source, 'static-snapshot');
  assert.equal(staticLoad.catalog.editions.length, 3);
  assert.equal(staticLoad.exhibition.config.id, SHARED_EXHIBITION.id);
  assert.equal(staticLoad.exhibition.mismatch, false);

  const ok = await loadCatalog({fetchImpl: async () => ({ok: true, json: async () => ({snapshotId: 'remote-v1', exhibition: {id: 'exp-x', layoutVersion: 9, zoneCount: 3, entryIds: []}, editions: catalog.editions})})});
  assert.equal(ok.source, 'api');
  assert.equal(ok.catalog.editions.length, 3);
  assert.equal(ok.exhibition.config.layoutVersion, 9);
  assert.equal(ok.exhibition.mismatch, true);

  const degraded = await loadCatalog({fetchImpl: async () => { throw new Error('offline'); }});
  assert.equal(degraded.source, 'snapshot-fallback');
  assert.equal(degraded.catalog.editions.length, 3);
  assert.ok(degraded.error);
});

test('edition and work detail are linked by stable IDs', () => {
  for (const edition of catalog.editions) for (const work of edition.works) {
    assert.equal(work.editionId, edition.id);
    assert.equal(findWork(work.id).id, work.id);
  }
});

test('catalog load times out and falls back to the bundled snapshot', async () => {
 // 挂起的请求（服务端不可达）必须在超时后降级，而不是永远卡在启动页。
 // 模拟挂起的请求：随 abort 拒绝（与真实 fetch 一致），事件循环才能排空。
 const hanging=(url,init)=>new Promise((_,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal.reason||new Error('aborted')));});
 // 小超时 + 保活计时器：AbortSignal.timeout 的计时器是 unref 的，测试进程需要保活才能等到它触发。
 const keeper=setInterval(()=>{},20);
 const started=Date.now();
 const result=await loadCatalog({fetchImpl:hanging,timeoutMs:150});
 clearInterval(keeper);
 assert.ok(Date.now()-started<5000,'在超时窗口内返回（不无限等待）');
 assert.equal(result.source,'snapshot-fallback','超时降级到内置快照');
 assert.ok(result.error,'记录失败原因');
 assert.equal(result.catalog.editions.length,3,'快照内容可用');
 // 显式传入 signal 时尊重调用方（不被内部超时覆盖）。
 let seen=null;
 await loadCatalog({fetchImpl:(url,init)=>{seen=init?.signal;return Promise.reject(new Error('boom'));}});
 assert.ok(seen,'调用方 signal 透传');
});

test('repo integrity: build-scope files must be tracked or intentionally ignored', async () => {
 const {findMissing,SCOPE_DIRS,IGNORE_ALLOWLIST}=await import('../scripts/verify-repo.mjs');
 // 正常：已跟踪的不报。
 assert.deepEqual(findMissing(['src/App.jsx','server/index.mjs'],['src/App.jsx','server/index.mjs'],[]),[]);
 // 漏提交：工作区有、没跟踪、没被忽略 → 必须报出来（Vercel 故障的教训）。
 assert.deepEqual(findMissing(['src/data/editions.json'],['src/App.jsx'],[]),['src/data/editions.json']);
 // 被 .gitignore 误伤同样算缺失（当年正是 data/ 未锚定根）。
 assert.deepEqual(findMissing(['src/data/editions.json'],['src/App.jsx'],['src/data/']),['src/data/editions.json']);
 // 有意忽略的运行期产物不报：根级 data/dist/artifacts/node_modules。
 assert.deepEqual(findMissing(['data/accounts.json','dist/index.html','node_modules/x/y.js'],[],[ 'data/','dist/','node_modules/' ]),[]);
 // 白名单不保护 SCOPE_DIRS 内的同名目录：src/data 必须入库。
 assert.ok(!IGNORE_ALLOWLIST.includes('src/data')&&SCOPE_DIRS.includes('src'));
 // 非 ASCII 路径：NFD/NFC 与引号转义都不应误报。
 assert.deepEqual(findMissing(['public/brand/source/原子之心logo-白字.png'],['public/brand/source/原子之心logo-白字.png'],[]),[]);
});
