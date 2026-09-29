import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sects-'));
process.env.ATOM_DATA_DIR=tmp;
const sects=await import('../server/sects.mjs');
const {createSect,updateSect,addElder,addDisciple,removeMember,findSect,loadSects,pageSects,ELDER_TITLES,DISCIPLE_TITLES,SECT_PAGE_SIZE}=sects;
const founder={id:'u-founder',name:'创派祖师'};
const outsider={id:'u-other',name:'路人甲'};

test('seed demo sects are paginated four per page with full role hierarchies', () => {
 const page1=pageSects(1);
 assert.equal(page1.pageSize,SECT_PAGE_SIZE);
 assert.equal(page1.sects.length,4,'每页 4 个门派');
 assert.ok(page1.total>=8,'演示门派超过一页');
 const detail=page1.sects[0];
 assert.ok(detail.name&&detail.slogan&&detail.intro&&detail.style,'门派资料齐全');
 assert.ok(detail.founderId&&detail.founderName,'创始人存在');
 assert.ok(detail.elders.length>0,'有长老');
 assert.ok(detail.disciples.length>0,'有弟子');
 // 弟子称号必须是预设（大师兄/二师兄/大师姐/二师姐/师弟/师妹/弟子）。
 for(const d of detail.disciples)assert.ok(DISCIPLE_TITLES.includes(d.title),`弟子称号非法: ${d.title}`);
 for(const e of detail.elders)assert.ok(ELDER_TITLES.includes(e.title),`长老称号非法: ${e.title}`);
 // 翻页不重叠
 const page2=pageSects(2);
 assert.deepEqual(page1.sects.map(s=>s.id).filter(id=>page2.sects.some(x=>x.id===id)),[],'翻页不重复');
});

test('creating a sect validates fields and enforces unique names', () => {
 assert.throws(()=>createSect({name:'',style:'jianghu'},founder),/门派名称/);
 assert.throws(()=>createSect({name:'测试门派',style:'bogus-style'},founder),/门派样式/);
 assert.throws(()=>createSect({name:'测试门派',style:'jianghu',slogan:'x'.repeat(31)},founder),/slogan/);
 const created=createSect({name:'测试门派',slogan:'一起做点东西',intro:'介绍',style:'startup'},founder);
 assert.equal(created.founderId,founder.id,'创建者即门派创始人');
 assert.equal(created.founderName,founder.name);
 assert.deepEqual(created.elders,[],'新门派暂无长老');
 assert.throws(()=>createSect({name:'测试门派',style:'jianghu'},outsider),/已被占用/,'名称全局唯一');
 assert.ok(findSect(created.id),'建派后可查');
});

test('only the founder may edit the sect or manage members', () => {
 const sect=createSect({name:'权限门派',style:'jianghu'},founder);
 assert.throws(()=>updateSect(sect.id,{name:'改名了',style:'jianghu'},outsider),/只有门派创始人/);
 assert.throws(()=>addElder(sect.id,{name:'阿原'},outsider),/只有门派创始人/);
 assert.throws(()=>addDisciple(sect.id,{name:'阿原'},outsider),/只有门派创始人/);
  assert.throws(()=>removeMember(sect.id,'阿原',outsider),/只有门派创始人/);
 // 创始人本人可以
 const updated=updateSect(sect.id,{name:'权限门派',slogan:'新口号',intro:'新介绍',style:'mystery'},founder);
 assert.equal(updated.style,'mystery');
 assert.equal(updated.slogan,'新口号');
 const withElder=addElder(sect.id,{name:'阿原',title:'执法长老'},founder);
 assert.equal(withElder.elders.length,1);
 assert.equal(withElder.elders[0].title,'执法长老');
 const withDisciple=addDisciple(sect.id,{name:'小满',title:'大师姐'},founder);
 assert.equal(withDisciple.disciples[0].title,'大师姐');
 assert.throws(()=>addDisciple(sect.id,{name:'小满',title:'掌门'},founder),/已在门派中|无效/);
 // 非预设称号回落默认
 const fallback=addDisciple(sect.id,{name:'星河',title:'不存在的称号'},founder);
 assert.equal(fallback.disciples.at(-1).title,'弟子','非法称号回落默认');
 // 移出成员
  const removed=removeMember(sect.id,'m-阿原',founder); // 长老 userId 由名字派生
  assert.equal(removed.elders.length,0,'长老被移出');
  assert.equal(removed.disciples.length,2,'两名弟子保留');
 // 重名校验：改名撞已存在门派被拒
 createSect({name:'占用名',style:'jianghu'},outsider);
 assert.throws(()=>updateSect(sect.id,{name:'占用名',style:'jianghu'},founder),/已被占用/);
});

test('sect data persists across reloads of the store', () => {
 const sect=createSect({name:'持久门派',style:'campus'},founder);
 addDisciple(sect.id,{name:'阿原',title:'大师兄'},founder);
 const reloaded=findSect(sect.id);
 assert.ok(reloaded,'重启后仍在');
 assert.equal(reloaded.disciples[0].title,'大师兄');
 assert.ok(loadSects().length>4,'演示 + 新建');
});
