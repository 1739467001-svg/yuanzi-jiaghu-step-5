import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OfficialShop,taskTopics} from '../server/official-shop.mjs';
import {allowImageHosts,coverHostAllowed} from '../server/cover-proxy.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-shop-'));
const shopFetch=async()=>({ok:true,headers:{get:()=>'application/json'},json:async()=>({
  list:[
   {id:'shop_1',name:'帆布袋',desc:'原子公社官方周边的帆布袋',price:1888,category:'周边',stock:88,sold:0,hot:true,icon:'https://atompub.oss-cn-beijing.aliyuncs.com/shop/a.png'},
   {id:'shop_2',name:'Token实体卡-200元面值',price:28888,category:'Token卡',stock:200,hot:true,icon:'https://atompub.oss-cn-beijing.aliyuncs.com/shop/b.png'},
  ],
})});
const tasksFetch=async()=>({ok:true,headers:{get:()=>'application/json'},json:async()=>[
  {id:'t1',title:'每日签到',description:'来江湖报个到',reward:20,exp:10,category:'daily',status:'claimed'},
  {id:'t10',title:'连续签到 30 天',reward:300,exp:200,category:'achievement',status:'ongoing'},
]});

test('OfficialShop maps items and tasks, registers icon hosts, and caches', async () => {
 const shop=new OfficialShop({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async url=>{
  if(String(url).includes('/api/shop/items'))return shopFetch();
  if(String(url).includes('/api/tasks'))return tasksFetch();
  throw new Error('unexpected '+url);
 }});
 const snapshot=await shop.refresh({force:true});
 assert.equal(snapshot.items.length,2);
 assert.equal(snapshot.items[0].name,'帆布袋');
 assert.equal(snapshot.items[0].price,1888);
 assert.equal(snapshot.items[0].hot,true);
 assert.equal(snapshot.tasks.length,2);
 assert.equal(snapshot.tasks[0].reward,20);
 // 商店图标主机已登记进封面代理白名单（工坊面板图标走同源代理）。
 assert.equal(coverHostAllowed('https://atompub.oss-cn-beijing.aliyuncs.com/shop/a.png'),true,'图标主机放行');
 assert.equal(coverHostAllowed('https://evil.example.com/x.png'),false,'陌生主机仍拒绝');
 // 磁盘缓存兜底：新实例冷启动恢复。
 const cold=new OfficialShop({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async()=>{throw new Error('不应请求');}});
 cold.restore();
 assert.equal(cold.snapshot().items.length,2,'冷启动从缓存恢复');
});

test('OfficialShop keeps the last snapshot when the fetch fails', async () => {
 const shop=new OfficialShop({base:'https://atomclub.cn/',dataDir:tmp,fetchImpl:async()=>{throw new Error('network down');}});
 shop.restore();
 assert.equal(shop.items.length,2);
 const errors=[];
 shop.onError=m=>errors.push(m);
 await shop.refresh({force:true});
 assert.equal(shop.items.length,2,'失败不清空');
 assert.match(shop.lastError,/network down/);
 assert.equal(errors.length,1);
 // 未配置时不介入。
 const off=new OfficialShop({base:'',dataDir:tmp,fetchImpl:async()=>{throw new Error('不应请求');}});
 assert.deepEqual(await off.refresh({force:true}),{items:[],tasks:[]});
});

test('taskTopics builds bounded reward strings for the task wall', () => {
 const topics=taskTopics({tasks:[
  {id:'1',title:'每日签到',reward:20},{id:'2',title:'连续签到 30 天',reward:300},{id:'3',title:'分享一篇茶帖',reward:60},
  {id:'4',title:'邀请 3 位侠客入社',reward:500},{id:'5',title:'任务五',reward:10},{id:'6',title:'任务六（应被截断）',reward:10},
 ]});
 assert.equal(topics.length,5,'任务墙最多 5 条');
 assert.equal(topics[0],'每日签到 +20币');
 assert.deepEqual(taskTopics(null),[]);
 assert.deepEqual(taskTopics({tasks:[]}),[]);
});

test('allowImageHosts merges hosts into the proxy registry', () => {
 allowImageHosts(['img.example.com','']);
 assert.equal(coverHostAllowed('https://img.example.com/a.png'),true);
 assert.equal(coverHostAllowed('https://other.example.com/a.png'),false);
});
