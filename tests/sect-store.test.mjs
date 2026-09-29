// 静态部署门派本地层的单测：分页口径与演示数据合并、建派唯一性、仅创始人可改成员。
// 与 tests/sects.test.mjs（服务端口径）互为镜像，保证两条路径行为一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSects,findSect,createSect,updateMembers,localSects} from '../src/world/sectStore.js';

// sectStore 直接读写 localStorage：给一个够用的最小桩。
const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
test('静态层分页：每页 4 个，共 8 个演示门派',()=>{
 const p1=pageSects(1,4);
 assert.equal(p1.total,8);assert.equal(p1.pages,2);assert.equal(p1.sects.length,4);
 assert.equal(p1.page,1);
 const p2=pageSects(2,4);
 assert.equal(p2.sects.length,4);
 assert.equal(pageSects(9,4).page,2,'超出范围夹到最后一页');
 assert.equal(pageSects(9,4).sects.length,4);
});
test('静态层查找与建派：名称全局唯一、样式合法',()=>{
 assert.equal(findSect('demo-yuanqi').name,'元气满满派');
 assert.equal(findSect('不存在'),null);
 const me={id:'local-you',name:'少侠'};
 const sect=createSect({name:'静态演示门',slogan:'一句话',intro:'介绍',style:'campus'},me);
 assert.equal(sect.founderId,'local-you');assert.equal(sect.founderName,'少侠');
 assert.deepEqual(sect.elders,[]);assert.deepEqual(sect.disciples,[]);
 assert.equal(pageSects(1,4).total,9,'自建门派并入分页');
 assert.throws(()=>createSect({name:'元气满满派',style:'jianghu'},me),/已被占用/,'与演示门派重名也拒绝');
 assert.throws(()=>createSect({name:'x',style:'jianghu'},me),/2—20/,'名称过短拒绝');
 assert.throws(()=>createSect({name:'合法名字',style:'不存在样式'},me),/请选择门派样式/,'非法样式被拒');
});
test('静态层成员管理：创始人可加长老弟子，他人改不了',()=>{
 const me={id:'local-you',name:'少侠'};
 const sect=createSect({name:'管理演示门',style:'jianghu'},me);
 let cur=updateMembers(sect.id,me,s=>{s.elders.push({userId:'m-青禾',name:'青禾',title:'传功长老'});});
 assert.equal(cur.elders.length,1);
 cur=updateMembers(sect.id,me,s=>{s.disciples.push({userId:'m-行舟',name:'行舟',title:'大师兄'});});
 assert.equal(cur.disciples[0].title,'大师兄');
 cur=updateMembers(sect.id,me,s=>{s.elders=s.elders.filter(e=>e.userId!=='m-青禾');s.disciples=s.disciples.filter(d=>d.userId!=='m-行舟');});
 assert.equal(cur.elders.length,0);assert.equal(cur.disciples.length,0);
 assert.throws(()=>updateMembers(sect.id,{id:'别人',name:'别人'},()=>{}),/只有门派创始人/,'非创始人拒绝');
 assert.throws(()=>updateMembers('不存在的门派',me,()=>{}),/门派不存在/);
 assert.equal(localSects().some(s=>s.id===sect.id),true,'自建门派落在本机存储');
});
