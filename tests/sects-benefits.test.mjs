// M3 权益与邀请追踪单测。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-m3-'));
process.env.ATOM_DATA_DIR=tmp;
const {createSect,setBenefits,applyToSect,listApplications,decideApplication,addElder,findSect}=await import('../server/sects.mjs');

const founder={id:'u-boss',name:'大掌门'};
const elder={id:'u-elder',name:'青禾长老'};
const guest={id:'u-guest',name:'游客阿'};
const outsider={id:'u-out',name:'路人'};
const sect=createSect({name:'权益测试门',slogan:'s',intro:'i',style:'jianghu'},founder);
const sid=sect.id;

test('权益碑默认空；掌门与长老可维护',()=>{
 assert.deepEqual(sect.benefits,[]);
 const r=setBenefits(sid,[{title:'门派资料包',detail:'每周精选',url:'https://example.com/a'}],founder);
 assert.equal(r.benefits.length,1);
 assert.equal(r.benefits[0].title,'门派资料包');
 // 先授权长老
 addElder(sid,{userId:elder.id,name:elder.name,title:'执法长老'},founder);
 // 长老也能维护
 const r2=setBenefits(sid,[{title:'共读名额',detail:'每月两次'}],elder);
 assert.equal(r2.benefits[0].title,'共读名额');
 assert.throws(()=>setBenefits(sid,[{title:'越权'}],outsider),/只有掌门与长老/);
});
test('权益校验：标题必填、上限 12、链接必须 https',()=>{
 assert.throws(()=>setBenefits(sid,[{title:''}],founder),/缺少标题/);
 assert.throws(()=>setBenefits(sid,'不是数组',founder),/权益格式不正确/);
 assert.throws(()=>setBenefits(sid,[{title:null}],founder),/缺少标题/);
 const many=Array.from({length:13},(_,i)=>({title:'权益'+i}));
 assert.throws(()=>setBenefits(sid,many,founder),/最多 12 条/);
 assert.throws(()=>setBenefits(sid,[{title:'坏链接',url:'http://不安全'}],founder),/https/);
 const ok=setBenefits(sid,[{title:'好链接',url:'https://atomclub.cn/x'}],founder);
 assert.equal(ok.benefits[0].url,'https://atomclub.cn/x');
});
test('申请带上邀请人；通过后邀请关系留档',()=>{
 const r=applyToSect(sid,{message:'冲着力益来的',inviter:founder.id},guest);
 assert.equal(r.joined,false);
 const app=listApplications(sid,founder).applications.find(a=>a.userId===guest.id);
 assert.equal(app.inviterId,founder.id,'邀请人已记录');
 const after=decideApplication(sid,app.id,'approve',founder);
 assert.equal(after.disciples.some(d=>d.userId===guest.id),true);
 const kept=after.applications.find(a=>a.id===app.id);
 assert.equal(kept.inviterId,founder.id,'审核后邀请关系仍在（赠金对账用）');
});
test('没有邀请人的申请不带 inviterId 字段',()=>{
 const plain={id:'u-plain',name:'无名侠'};
 applyToSect(sid,{message:'路过'},plain);
 const app=listApplications(sid,founder).applications.find(a=>a.userId===plain.id);
 assert.equal(app.inviterId,undefined);
});
test('权益碑与邀请记录在刷新后仍在',()=>{
 const fresh=findSect(sid);
 assert.equal(fresh.benefits.length,1);
 assert.ok(fresh.applications.some(a=>a.inviterId),'邀请记录持久化');
});
process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));
