// 官网内容抓取（社区热帖 + AI 资讯）：TTL 快照 + 失败沿用上次 + 磁盘缓存兜底。
// 用途（3D × 平台对接 P0，见 docs/THREE_D_INTEGRATION.md 3.2）：
//   ① 论剑台旁的英雄帖贴真实社区热帖（本地世界 heroBoard）；
//   ② AI 侠客的两两闲聊话题引用真实帖子标题（本地引擎 + 联机服务端引擎同一份数据）。
// 未配置（本地开发/静态部署）时整个模块不介入：英雄帖保持示范条目、闲聊用内置话题。
import fs from 'node:fs';
import path from 'node:path';

const CACHE_FILE='official-feed-cache.json';
const MAX_TOPICS=12;

function clean(v,max){return String(v||'').trim().slice(0,max);}
// 话题/帖子条目：标题截断到 18 字（3D 气泡与英雄帖都放不下长标题），带作者/来源。
function toTopic(item,{authorKey='authorName',source=false}={}){
 const title=clean(item?.title,18);
 if(!title)return null;
 const who=clean(item?.[authorKey]||(source?item?.source:''),10);
 return {id:clean(item?.id,64)||title,title,...(who?{who}:{})};
}
// 英雄帖/闲聊用的话题串（纯文本，截断；取前 5 条热帖 + 前 3 条资讯）。
export function feedTopics(feed){
 const posts=(feed?.posts||[]).slice(0,5).map(p=>`《${p.title}》${p.who?'— '+p.who:''}`);
 const news=(feed?.news||[]).slice(0,3).map(n=>`资讯：${n.title}${n.who?'（'+n.who+'）':''}`);
 return [...posts,...news].filter(Boolean).slice(0,MAX_TOPICS);
}

export class OfficialFeed{
 constructor({base,ttlMs=900000,dataDir,fetchImpl=fetch,timeoutMs=10000,onError}={}){
  this.base=String(base||'').replace(/\/+$/,'');
  this.ttlMs=Math.max(30000,Number(ttlMs)||900000);
  this.dataDir=dataDir;
  this.fetchImpl=fetchImpl;
  this.timeoutMs=timeoutMs;
  this.onError=onError;
  this.posts=[];this.news=[];
  this.lastSync=0;this.lastError=null;this.timer=null;this.started=false;this.onSync=null;
 }
 get cacheFile(){return path.join(this.dataDir,CACHE_FILE);}
 get configured(){return !!this.base;}
 status(){
  return {kind:this.configured?'official':'local',url:this.base,posts:this.posts.length,news:this.news.length,
   syncedAt:this.lastSync,error:this.lastError};
 }
 // 冷启动：磁盘缓存先顶上（官网抖动时话题不断供）。
 restore(){
  try{
   const cached=JSON.parse(fs.readFileSync(this.cacheFile,'utf8'));
   if(cached&&Array.isArray(cached.posts)){this.posts=cached.posts;this.news=cached.news||[];this.lastSync=cached.syncedAt||0;}
  }catch{}
  this.onSync?.(this.snapshot());
  return this.snapshot();
 }
 snapshot(){return {posts:this.posts,news:this.news};}
 async refresh({force=false}={}){
  if(!this.configured)return this.snapshot();
  if(!force&&Date.now()-this.lastSync<this.ttlMs)return this.snapshot();
  try{
   const get=async p=>{
    const r=await this.fetchImpl(this.base+p,{signal:AbortSignal.timeout(this.timeoutMs),headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(p+' → HTTP '+r.status);
    return r.json();
   };
   const [postsRes,newsRes]=await Promise.all([get('/api/teahouse/posts/hot'),get('/api/news')]);
   const posts=Array.isArray(postsRes)?postsRes:(postsRes.list||[]);
   const news=Array.isArray(newsRes)?newsRes:(newsRes.list||[]);
   this.posts=posts.map(p=>toTopic(p)).filter(Boolean).slice(0,10);
   this.news=news.map(n=>toTopic(n,{authorKey:'source',source:true})).filter(Boolean).slice(0,10);
   this.lastSync=Date.now();this.lastError=null;
   fs.mkdirSync(this.dataDir,{recursive:true});
   const tmp=this.cacheFile+'.tmp';
   fs.writeFileSync(tmp,JSON.stringify({syncedAt:this.lastSync,posts:this.posts,news:this.news}));
   fs.renameSync(tmp,this.cacheFile);
  }catch(error){
   // 失败不清空上一次快照：官网抖动时英雄帖与话题照常。
   this.lastError=error.message||String(error);
   this.onError?.('官网内容抓取失败（沿用上次快照）：'+this.lastError);
  }
  this.onSync?.(this.snapshot());
  return this.snapshot();
 }
 start(){
  if(this.started||!this.configured)return;
  this.started=true;
  this.refresh({force:true}).catch(()=>{});
  this.timer=setInterval(()=>{this.refresh().catch(()=>{});},this.ttlMs);
  if(this.timer.unref)this.timer.unref();
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.started=false;}
}

// ---- 装配与插件（与 sects-source / sects-api 同模式）----
let feed=null;
// 由 server/index.mjs 与 vite.config.js 启动时调用；未配置返回 null（本地/静态部署不介入）。
export function configureOfficialFeed(env=process.env,{dataDir}={}){
 const base=String(env.ATOM_OFFICIAL_SITE||'').trim();
 if(!base)return null;
 const dir=dataDir||(env.ATOM_DATA_DIR?path.resolve(env.ATOM_DATA_DIR):path.join(path.resolve(import.meta.dirname,'..'),'data'));
 feed=new OfficialFeed({base,ttlMs:Number(env.ATOM_FEED_TTL_MS)||900000,dataDir:dir,
  onError:msg=>{try{console.warn('[官网内容] '+msg);}catch{}}});
 feed.restore();
 return feed;
}
export function officialFeed(){return feed;}
export function officialFeedPlugin(){
 const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 const plugin={name:'atom-official-feed',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname!=='/api/feed')return next();
   if(req.method!=='GET')return send(res,405,{error:'接口仅支持 GET'});
   const snapshot=feed?feed.snapshot():{posts:[],news:[]};
   return send(res,200,{...snapshot,topics:feedTopics(snapshot),source:feed?feed.status():{kind:'local'}});
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
