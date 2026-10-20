import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OfficialFeed,feedTopics} from '../server/official-feed.mjs';
import {WorldEngine} from '../src/world/engine.js';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-feed-'));
const okFetch=async()=>({ok:true,headers:{get:()=>'application/json'},json:async()=>({
  list:[
   {id:'tea_1',title:'a16z最新90页报告：AI的钱正流向哪里',authorName:'Might',authorTag:'原子之心联合创始人'},
   {id:'tea_2',title:'如何用一周把想法做成能跑的原型',authorName:'阿原'},
  ],
})});
const newsFetch=async()=>({ok:true,headers:{get:()=>'application/json'},json:async()=>[
  {id:'news_1',title:'谷歌发布 Gemini 3.8 Flash',source:'量子位',link:'https://example.com/1'},
]});

test('OfficialFeed maps hot posts and news, truncates titles, and keeps a disk cache', async () => {
 const feed=new OfficialFeed({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async url=>{
  if(String(url).includes('/api/teahouse/posts/hot'))return okFetch();
  if(String(url).includes('/api/news'))return newsFetch();
  throw new Error('unexpected '+url);
 }});
 const snapshot=await feed.refresh({force:true});
 assert.equal(snapshot.posts.length,2);
 assert.equal(snapshot.posts[0].title,'a16z最新90页报告：AI的钱正流');
 assert.equal(snapshot.posts[0].who,'Might');
 assert.equal(snapshot.news.length,1);
 assert.equal(snapshot.news[0].who,'量子位');
 assert.equal(feed.lastError,null);
 // 磁盘缓存兜底：新实例冷启动能从缓存恢复。
 const cold=new OfficialFeed({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async()=>{throw new Error('不应请求');}});
 cold.restore();
 assert.equal(cold.snapshot().posts.length,2,'冷启动从缓存恢复');
});

test('OfficialFeed keeps the last snapshot when the fetch fails', async () => {
 const feed=new OfficialFeed({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async()=>{throw new Error('network down');}});
 feed.restore(); // 先拿到上次快照（上一个测试写的磁盘缓存：2 条热帖）
 assert.equal(feed.posts.length,2);
 const errors=[];
 feed.onError=m=>errors.push(m);
 await feed.refresh({force:true});
 assert.equal(feed.posts.length,2,'抓取失败不清空——沿用上次快照');
 assert.match(feed.lastError,/network down/);
 assert.equal(errors.length,1,'失败有提示');
 // 未配置时整个模块不介入。
 const off=new OfficialFeed({base:'',dataDir:tmp,fetchImpl:async()=>{throw new Error('不应请求');}});
 assert.deepEqual(await off.refresh({force:true}),{posts:[],news:[]});
 assert.equal(off.configured,false);
});

test('feedTopics builds bounded topic strings for the hero board and chatter', () => {
 const topics=feedTopics({posts:[
  {id:'1',title:'帖子一',who:'Might'},{id:'2',title:'帖子二'},{id:'3',title:'帖子三'},{id:'4',title:'帖子四'},
  {id:'5',title:'帖子五'},{id:'6',title:'帖子六（应被截断）'},
 ],news:[{id:'n1',title:'资讯一',who:'量子位'},{id:'n2',title:'资讯二'},{id:'n3',title:'资讯三'},{id:'n4',title:'资讯四（应被截断）'}]});
 assert.equal(topics.length,8,'5 热帖 + 3 资讯');
 assert.equal(topics[0],'《帖子一》— Might');
 assert.equal(topics[1],'《帖子二》','无作者时不加后缀');
 assert.equal(topics[5],'资讯：资讯一（量子位）');
 // 空快照给空列表（调用方保持示范条目）。
 assert.deepEqual(feedTopics(null),[]);
 assert.deepEqual(feedTopics({posts:[],news:[]}),[]);
});

test('engine chatter uses official feed topics when provided, falls back otherwise', () => {
 // 有官网话题：闲聊事件里出现官网帖子标题。
 const withFeed=new WorldEngine();
 withFeed.setFeed(['《官网热帖标题》','资讯：官网快讯']);
 const seen=[];
 const engine=new WorldEngine(e=>{if(e.kind==='chat')seen.push(e.text);});
 engine.setFeed(['《官网热帖标题》']);
 for(let i=0;i<20000&&!seen.some(t=>t.includes('官网热帖标题'));i++)engine.tick(.1);
 assert.ok(seen.some(t=>t.includes('官网热帖标题')),'闲聊引用官网话题');
 // 无官网话题：池里只有内置话题，不报错也不出现官网串。
 const plain=new WorldEngine();
 assert.deepEqual(plain.socialTopic(0),'开源分享');
 plain.setFeed(['x']);plain.setFeed(null);plain.setFeed(['',null,5]);
 assert.deepEqual(plain.feedTopics,[],'坏输入被滤掉');
});
