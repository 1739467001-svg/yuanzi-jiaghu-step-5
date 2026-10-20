// 官网经济数据抓取（原子币商店 + 任务中心）：TTL 快照 + 失败沿用上次 + 磁盘缓存兜底。
// 用途（3D × 平台对接 P1 展示态，见 docs/THREE_D_INTEGRATION.md 3.3）：
//   ① 论剑台旁的任务墙贴官网真实任务（每日签到 +20 币、连签 30 天 +300 币……）；
//   ② 共创工坊面板的「原子币商店」陈列官网周边（帆布袋 1888 币、Token 实体卡……）。
// 只读展示：兑换与签到在官网进行（身份/账本接口待官方确认，见 THREE_D_INTEGRATION.md 分期表）。
// 未配置时整个模块不介入：任务墙保持示范条目、工坊面板不显示商店区。
import fs from 'node:fs';
import path from 'node:path';
import {allowImageHosts} from './cover-proxy.mjs';

const CACHE_FILE='official-economy-cache.json';
const MAX_ITEMS=12,MAX_TASKS=12;

function clean(v,max){return String(v||'').trim().slice(0,max);}
function hostOf(value){try{return new URL(value).host;}catch{return '';}}
function toItem(raw){
 const name=clean(raw?.name,20);
 if(!name)return null;
 return {
  id:clean(raw?.id,64)||name,
  name,
  desc:clean(raw?.desc,60),
  price:Number(raw?.price)||0,
  category:clean(raw?.category,12),
  stock:Number(raw?.stock)||0,
  hot:!!raw?.hot,
  icon:clean(raw?.icon,300),
 };
}
function toTask(raw){
 const title=clean(raw?.title,20);
 if(!title)return null;
 return {
  id:clean(raw?.id,64)||title,
  title,
  desc:clean(raw?.description,40),
  reward:Number(raw?.reward)||0,
  exp:Number(raw?.exp)||0,
  category:clean(raw?.category,12),
  status:clean(raw?.status,12),
 };
}
// 任务墙条目串（与英雄帖同规格：短标题 + 奖励）。
export function taskTopics(economy){
 return (economy?.tasks||[]).slice(0,5).map(t=>`${t.title} +${t.reward}币`);
}

export class OfficialShop{
 constructor({base,ttlMs=900000,dataDir,fetchImpl=fetch,timeoutMs=10000,onError}={}){
  this.base=String(base||'').replace(/\/+$/,'');
  this.ttlMs=Math.max(30000,Number(ttlMs)||900000);
  this.dataDir=dataDir;
  this.fetchImpl=fetchImpl;
  this.timeoutMs=timeoutMs;
  this.onError=onError;
  this.items=[];this.tasks=[];
  this.lastSync=0;this.lastError=null;this.timer=null;this.started=false;this.onSync=null;
 }
 get cacheFile(){return path.join(this.dataDir,CACHE_FILE);}
 get configured(){return !!this.base;}
 status(){
  return {kind:this.configured?'official':'local',url:this.base,items:this.items.length,tasks:this.tasks.length,
   syncedAt:this.lastSync,error:this.lastError};
 }
 restore(){
  try{
   const cached=JSON.parse(fs.readFileSync(this.cacheFile,'utf8'));
   if(cached&&Array.isArray(cached.items)){this.items=cached.items;this.tasks=cached.tasks||[];this.lastSync=cached.syncedAt||0;this.registerIconHosts();}
  }catch{}
  this.onSync?.(this.snapshot());
  return this.snapshot();
 }
 snapshot(){return {items:this.items,tasks:this.tasks};}
 // 商店图标也在 OSS 上（不回 CORS 头）：登记进封面代理的白名单，工坊面板的图标走同源代理。
 registerIconHosts(){
  const hosts=new Set();
  for(const item of this.items)if(item.icon){const h=hostOf(item.icon);if(h)hosts.add(h);}
  allowImageHosts(hosts);
 }
 async refresh({force=false}={}){
  if(!this.configured)return this.snapshot();
  if(!force&&Date.now()-this.lastSync<this.ttlMs)return this.snapshot();
  try{
   const get=async p=>{
    const r=await this.fetchImpl(this.base+p,{signal:AbortSignal.timeout(this.timeoutMs),headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(p+' → HTTP '+r.status);
    return r.json();
   };
   const [itemsRes,tasksRes]=await Promise.all([get('/api/shop/items'),get('/api/tasks')]);
   const items=Array.isArray(itemsRes)?itemsRes:(itemsRes.list||[]);
   const tasks=Array.isArray(tasksRes)?tasksRes:(tasksRes.list||[]);
   this.items=items.map(toItem).filter(Boolean).slice(0,MAX_ITEMS);
   this.tasks=tasks.map(toTask).filter(Boolean).slice(0,MAX_TASKS);
   this.lastSync=Date.now();this.lastError=null;
   this.registerIconHosts();
   fs.mkdirSync(this.dataDir,{recursive:true});
   const tmp=this.cacheFile+'.tmp';
   fs.writeFileSync(tmp,JSON.stringify({syncedAt:this.lastSync,items:this.items,tasks:this.tasks}));
   fs.renameSync(tmp,this.cacheFile);
  }catch(error){
   this.lastError=error.message||String(error);
   this.onError?.('官网经济数据抓取失败（沿用上次快照）：'+this.lastError);
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

// ---- 装配与插件（与 official-feed / sects 同模式）----
let shop=null;
export function configureOfficialShop(env=process.env,{dataDir}={}){
 const base=String(env.ATOM_OFFICIAL_SITE||'').trim();
 if(!base)return null;
 const dir=dataDir||(env.ATOM_DATA_DIR?path.resolve(env.ATOM_DATA_DIR):path.join(path.resolve(import.meta.dirname,'..'),'data'));
 shop=new OfficialShop({base,ttlMs:Number(env.ATOM_SHOP_TTL_MS)||900000,dataDir:dir,
  onError:msg=>{try{console.warn('[官网经济] '+msg);}catch{}}});
 shop.restore();
 return shop;
}
export function officialShop(){return shop;}
export function officialShopPlugin(){
 const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 const plugin={name:'atom-official-shop',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname!=='/api/economy')return next();
   if(req.method!=='GET')return send(res,405,{error:'接口仅支持 GET'});
   const snapshot=shop?shop.snapshot():{items:[],tasks:[]};
   return send(res,200,{...snapshot,taskTopics:taskTopics(snapshot),source:shop?shop.status():{kind:'local'}});
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
