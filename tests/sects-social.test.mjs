// M2 社交化单测：加入策略、申请、审核后入驻、公告权限、重复申请、越权。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-m2-'));
process.env.ATOM_DATA_DIR=tmp;
const {createSect,updateLayout,applyToSect,listApplications,decideApplication,setJoinPolicy,addNotice,removeNotice,addElder,findSect}=await import('../server/sects.mjs');

const zhang={id:'u-zhang',name:'张掌门'};
const li={id:'u-li',name:'李弟子'};
const wang={id:'u-wang',name:'王少侠'};
const elder={id:'u-elder',name:'青禾长老'};
const sect=createSect({name:'社交测试门',slogan:'s',intro:'i',style:'jianghu'},zhang);
const sid=sect.id;

test('默认加入方式是申请制，且带公告与申请容器',()=>{
 assert.equal(sect.joinPolicy,'apply');
 assert.deepEqual(sect.notices,[]);
 assert.deepEqual(sect.applications,[]);
});
test('游客未登录不能申请；邀请制拒绝；开放加入直接入驻',()=>{
 assert.throws(()=>applyToSect(sid,{},null),/需要先有名帖身份/);
 setJoinPolicy(sid,'invite',zhang);
 assert.throws(()=>applyToSect(sid,{message:'求加入'},wang),/只接受邀请/);
 setJoinPolicy(sid,'open',zhang);
 const r=applyToSect(sid,{},li);
 assert.equal(r.joined,true,'开放加入直接入驻');
 assert.equal(r.sect.disciples.some(d=>d.userId===li.id),true);
 // 已在门派里的人不能再申请
 assert.throws(()=>applyToSect(sid,{},li),/已经在这座门派里/);
});
test('申请制：提交→待处理→重复提交被拒→掌门通过后自动入驻为弟子',()=>{
 setJoinPolicy(sid,'apply',zhang);
 const r=applyToSect(sid,{message:'想学共创'},wang);
 assert.equal(r.joined,false);
 const list=listApplications(sid,zhang).applications;
 const app=list.find(a=>a.userId===wang.id);
 assert.equal(app.status,'pending');
 assert.equal(app.message,'想学共创');
 assert.throws(()=>applyToSect(sid,{},wang),/别重复提交/);
 const after=decideApplication(sid,app.id,'approve',zhang);
 assert.equal(after.disciples.some(d=>d.userId===wang.id&&d.title==='弟子'),true,'通过后入驻为弟子');
 assert.equal(listApplications(sid,zhang).applications.find(a=>a.id===app.id).status,'approved');
 assert.throws(()=>decideApplication(sid,app.id,'approve',zhang),/已经处理过了/);
});
test('婉拒不入驻，且可以再次申请',()=>{
 const guest={id:'u-guest',name:'过客'};
 const r=applyToSect(sid,{},guest);
 const app=listApplications(sid,zhang).applications.find(a=>a.userId===guest.id);
 const after=decideApplication(sid,app.id,'reject',zhang);
 assert.equal(after.disciples.some(d=>d.userId===guest.id),false,'婉拒不入驻');
 assert.equal(after.applications.find(a=>a.id===app.id).status,'rejected');
 applyToSect(sid,{message:'再试一次'},guest);   // 不抛错即为可再申请
});
test('只有掌门能审核与改加入方式；掌门和长老能看申请、发公告',()=>{
 const other={id:'u-other',name:'路人'};
 assert.throws(()=>listApplications(sid,other),/只有掌门与长老/);
 assert.throws(()=>decideApplication(sid,'app-x','approve',other),/只有门派创始人/);
 assert.throws(()=>setJoinPolicy(sid,'open',other),/只有门派创始人/);
 // 授权长老
 addElder(sid,{userId:elder.id,name:elder.name,title:'执法长老'},zhang);
 assert.equal(listApplications(sid,elder).applications.length>=0,true,'长老可看申请');
 assert.throws(()=>decideApplication(sid,'app-x','approve',elder),/只有门派创始人/,'长老不能审核');
 const n=addNotice(sid,{text:'本周举行茶会'},elder);
 assert.equal(n.notices[0].text,'本周举行茶会');
 assert.equal(n.notices[0].by,elder.name,'公告署名长老');
 assert.throws(()=>addNotice(sid,{text:''},elder),/公告不能为空/);
 const removed=removeNotice(sid,n.notices[0].id,elder);
 assert.equal(removed.notices.length,0);
 assert.throws(()=>addNotice(sid,{text:'x'},other),/只有掌门与长老/,'路人不能发公告');
});
test('公告上限 20 条，申请与公告在刷新后仍在',()=>{
 for(let i=0;i<25;i++)addNotice(sid,{text:'公告'+i},zhang);
 const fresh=findSect(sid);
 assert.equal(fresh.notices.length,20,'超出 20 条截断');
 assert.ok(fresh.applications.length>=3,'申请记录持久化');
 assert.ok(fresh.disciples.some(d=>d.userId===wang.id),'入驻记录持久化');
});
process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));
