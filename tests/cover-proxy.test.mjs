import test from 'node:test';
import assert from 'node:assert/strict';
import {coverHostAllowed,createCoverCache,fetchCover} from '../server/cover-proxy.mjs';

const sects=[
 {id:'s1',name:'原子公社',coverUrl:'https://atompub.oss-cn-beijing.aliyuncs.com/cover/a.png'},
 {id:'s2',name:'带派',coverUrl:undefined,logo:'https://atompub.oss-cn-beijing.aliyuncs.com/logo/b.png'},
 {id:'s3',name:'无图派'},
];

test('coverHostAllowed only passes hosts seen in the remote snapshot or the source', () => {
 assert.equal(coverHostAllowed('https://atompub.oss-cn-beijing.aliyuncs.com/cover/a.png',sects,'https://atomclub.cn/api'),true,'快照里的封面主机放行');
 assert.equal(coverHostAllowed('https://atompub.oss-cn-beijing.aliyuncs.com/logo/any.png',sects),true,'同主机其他路径也放行（按主机寻址）');
 assert.equal(coverHostAllowed('https://atomclub.cn/api/sects/cover.png',sects,'https://atomclub.cn/api'),true,'数据源主机放行');
 assert.equal(coverHostAllowed('https://evil.example.com/x.png',sects,'https://atomclub.cn/api'),false,'陌生主机拒绝（防开放代理/SSRF）');
 assert.equal(coverHostAllowed('http://127.0.0.1:6379/',sects),false,'内网地址拒绝');
 assert.equal(coverHostAllowed('file:///etc/passwd',sects),false,'非 http(s) 拒绝');
 assert.equal(coverHostAllowed('not-a-url',sects),false,'垃圾输入拒绝');
 assert.equal(coverHostAllowed('',sects),false,'空值拒绝');
 assert.equal(coverHostAllowed('https://atompub.oss-cn-beijing.aliyuncs.com/x.png',[]),false,'没有快照时只认数据源主机');
});

test('fetchCover validates status, content type and size', async () => {
 const ok=await fetchCover('https://x/a.png',{fetchImpl:async()=>({ok:true,headers:{get:()=>'image/png'},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})});
 assert.deepEqual(ok.buffer,Buffer.from([1,2,3]));
 assert.equal(ok.contentType,'image/png');
 assert.equal(await fetchCover('https://x/a.png',{fetchImpl:async()=>({ok:false,headers:{get:()=>'image/png'},arrayBuffer:async()=>new Uint8Array().buffer})}),null,'非 2xx 拒绝');
 assert.equal(await fetchCover('https://x/a.json',{fetchImpl:async()=>({ok:true,headers:{get:()=>'application/json'},arrayBuffer:async()=>new Uint8Array([1]).buffer})}),null,'非图片类型拒绝');
 const big=new Uint8Array(5*1024*1024).buffer;
 assert.equal(await fetchCover('https://x/big.png',{fetchImpl:async()=>({ok:true,headers:{get:()=>'image/png'},arrayBuffer:async()=>big})}),null,'超大拒绝');
 assert.equal(await fetchCover('https://x/empty.png',{fetchImpl:async()=>({ok:true,headers:{get:()=>'image/png'},arrayBuffer:async()=>new Uint8Array().buffer})}),null,'空图拒绝');
});

test('cover cache stores, expires and evicts', () => {
 const cache=createCoverCache();
 cache.set('u1',{buffer:Buffer.from([1]),contentType:'image/png'});
 assert.deepEqual(cache.get('u1').buffer,Buffer.from([1]));
 assert.equal(cache.get('u2'),null,'未命中返回 null');
 // 容量淘汰：灌满后最早的被挤掉（Map 保序）。
 for(let i=0;i<200;i++)cache.set('k'+i,{buffer:Buffer.from([i]),contentType:'image/png'});
 assert.equal(cache.get('u1'),null,'容量上限挤出旧条目');
 assert.equal(cache.get('k199')!==null,true,'新条目在');
});
