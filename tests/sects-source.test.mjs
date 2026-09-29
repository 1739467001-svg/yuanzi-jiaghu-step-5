// 原子公社门派网站接入单测：字段映射、非法行跳过、响应形态、覆盖层合并、故障保留快照。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {mapRemoteSect,mapRemotePayload,diffPatch,SectSource} from '../server/sects-source.mjs';

test('远程字段映射：别名/三角色/非法样式兜底',()=>{
 const sect=mapRemoteSect({sectId:'s-1',sectName:'元气满满派',tagline:'一起把想法做出来',description:'介绍',theme:'startup',
  leader:{id:'u-9',nickname:'创派祖师'},
  council:[{id:'u-2',name:'青禾',role:'执法长老'}],
  members:[{id:'u-3',name:'阿原',title:'大师兄'},{id:'u-4',name:'小满',title:'二师姐'}]});
 assert.equal(sect.id,'s-1');assert.equal(sect.name,'元气满满派');
 assert.equal(sect.slogan,'一起把想法做出来');assert.equal(sect.style,'startup');
 assert.equal(sect.founderId,'u-9');assert.equal(sect.founderName,'创派祖师');
 assert.deepEqual(sect.elders,[{userId:'u-2',name:'青禾',title:'执法长老'}]);
 assert.deepEqual(sect.disciples.map(d=>d.title),['大师兄','二师姐']);
 // members 里没有明确称号 → 归入长老阁（兜底「长老」）
 const mixed=mapRemoteSect({id:'s-2',name:'未分堆门派',members:[{id:'u-1',name:'有人'}]});
 assert.deepEqual(mixed.elders.map(e=>e.title),['长老']);
 // 非法样式退回 jianghu；缺 id/name 的整条跳过
 assert.equal(mapRemoteSect({id:'s-3',name:'无样式门派',style:'nope'}).style,'jianghu');
 assert.equal(mapRemoteSect({name:'没有 id'}),null);
 assert.equal(mapRemoteSect(null),null);
});
test('响应形态：{sects}/{items}/裸数组都认，坏行单独跳过',()=>{
 assert.equal(mapRemotePayload({items:[{id:'a',name:'甲'},{name:'坏行'}]}).sects.length,1);
 assert.equal(mapRemotePayload([{id:'b',name:'乙'}]).sects.length,1);
 assert.equal(mapRemotePayload({data:[{id:'c',name:'丙'}]}).sects.length,1);
 assert.equal(mapRemotePayload({sects:[{id:'a',name:'甲'},{name:'坏行'}]}).skipped.length,1);
 assert.deepEqual(mapRemotePayload({}).sects,[]);
});
test('SectSource：拉取→快照→覆盖层→刷新后本地改动仍在',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-src-'));
 const calls=[];
 const rows=[{sects:[{id:'s-1',name:'元气满满派',slogan:'一句话',style:'campus',leader:{id:'u-1',name:'祖师'},
   elders:[{id:'e-1',name:'青禾',title:'执法长老'}],disciples:[]}]}];
 const fetchImpl=async(url,opt)=>{
  calls.push(url);
  return {ok:true,headers:{get:()=>'application/json'},json:async()=>rows[0]};
 };
 const source=new SectSource({base:'https://example.com/api/',ttlMs:10,dataDir:dir,fetchImpl});
 assert.equal(source.status().kind,'remote');
 await source.refresh({force:true});
 assert.equal(calls[0],'https://example.com/api/sects','基地址尾部斜杠被规整');
 let snap=source.snapshot();
 assert.equal(snap.length,1);assert.equal(snap[0].style,'campus');
 assert.equal(snap[0].elders[0].title,'执法长老');
 // 本地加一个弟子 → 覆盖层
 snap[0].disciples.push({userId:'m-阿原',name:'阿原',title:'大师兄'});
 source.writeOverlay(snap);
 assert.ok(fs.existsSync(path.join(dir,'sects-overlay.json')),'覆盖层落盘');
 // 远程刷新（内容不变）后，覆盖层仍贴回去
 await source.refresh({force:true});
 const after=source.snapshot();
 assert.equal(after[0].disciples.length,1,'刷新后本地加的弟子还在');
 assert.equal(after[0].disciples[0].title,'大师兄');
 // 本地新建（远程没有的 id）→ 刷新后仍在
 source.writeOverlay([...after,{id:'local-1',name:'本机门派',style:'jianghu',elders:[],disciples:[],createdAt:1,founderId:'x',founderName:'我',slogan:'',intro:''}]);
 await source.refresh({force:true});
 assert.equal(source.snapshot().filter(s=>s.id==='local-1').length,1,'本机门派刷新后保留');
 // 远程已有同名门派时以远程为准
 source.writeOverlay([...source.snapshot().filter(s=>s.id!=='local-1'),{id:'local-2',name:'元气满满派',style:'jianghu',elders:[],disciples:[],createdAt:2,founderId:'y',founderName:'我'}]);
 await source.refresh({force:true});
 assert.equal(source.snapshot().filter(s=>s.name==='元气满满派').length,1,'同名不重复：远程优先');
 fs.rmSync(dir,{recursive:true,force:true});
});
test('故障与缓存：失败保留上次快照，重启用磁盘缓存兜底',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-src2-'));
 let ok=true;
 const fetchImpl=async()=>ok
  ?{ok:true,headers:{get:()=>'application/json'},json:async()=>({sects:[{id:'s-1',name:'元气满满派'}]})}
  :{ok:false,status:502,headers:{get:()=>'application/json'},json:async()=>({})};
 const source=new SectSource({base:'https://example.com',ttlMs:10,dataDir:dir,fetchImpl});
 await source.refresh({force:true});
 assert.equal(source.snapshot().length,1);
 ok=false;
 await source.refresh({force:true});
 assert.equal(source.snapshot().length,1,'远程挂了沿用上次快照');
 assert.match(source.status().error||'',/502/,'记录错误原因');
 // 新实例（模拟重启）：远程不通时先用磁盘缓存
 const fetchFail=async()=>{throw new Error('network down');};
 const restarted=new SectSource({base:'https://example.com',ttlMs:10,dataDir:dir,fetchImpl:fetchFail});
 restarted.restore();
 assert.equal(restarted.snapshot().length,1,'冷启动读磁盘缓存');
 assert.equal(restarted.status().kind,'remote');
 fs.rmSync(dir,{recursive:true,force:true});
});
test('真实 HTTP：本地 mock 站点拉取成功',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atom-src3-'));
 const server=http.createServer((req,res)=>{
  assert.equal(req.url,'/sects');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({sects:[{id:'s-1',name:'元气满满派',style:'mystery',disciples:[{id:'d-1',name:'阿原',title:'大师兄'}]}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {port}=server.address();
 const source=new SectSource({base:`http://127.0.0.1:${port}`,ttlMs:60000,dataDir:dir});
 await source.refresh({force:true});
 const snap=source.snapshot();
 assert.equal(snap.length,1);assert.equal(snap[0].style,'mystery');
 assert.equal(snap[0].disciples[0].title,'大师兄');
 assert.equal(source.status().error,null);
 await new Promise(r=>server.close(r));
 fs.rmSync(dir,{recursive:true,force:true});
});
test('diffPatch：只记改动字段',()=>{
 const base={name:'甲',slogan:'旧',intro:'介绍',style:'jianghu',elders:[],disciples:[]};
 assert.deepEqual(diffPatch(base,{...base}),{},'无差异');
 assert.deepEqual(diffPatch(base,{...base,slogan:'新'}),{slogan:'新'},'只记 slogan');
 const changed={...base,elders:[{userId:'u',name:'青禾',title:'长老'}]};
 assert.deepEqual(Object.keys(diffPatch(base,changed)),['elders']);
});
