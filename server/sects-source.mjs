// 原子公社门派网站接入：远程门派数据 → 本项目字段映射 + TTL 快照 + 本地覆盖层。
// 未配置 ATOM_SECTS_SOURCE 时整个模块不介入，server/sects.mjs 照旧走 data/sects.json 与演示数据。
//
// 设计（见 docs/SECTS.md「接入原子公社门派网站时的替换点」）：
//   读：远程站点为权威；按 ttl 周期性刷新，失败保留上一次快照；冷启动可用磁盘缓存兜底。
//   写：本地写入（建派/改资料/加减成员）记录进覆盖层 data/sects-overlay.json，
//       每次刷新后按 id 重新贴回远程数据上——远程站点尚未开放管理接口时的最小可用形态。
import fs from 'node:fs';
import path from 'node:path';
import {THEMES} from '../src/world/config.js';

const STYLES=Object.keys(THEMES);
const OVERLAY='sects-overlay.json',CACHE='sects-cache.json';
const PATCH_FIELDS=['name','slogan','intro','style','elders','disciples'];
// 称号预设与 server/sects.mjs 保持一致（远端给错称号时按身份兜底）。
const ELDERS=['长老','执法长老','传功长老','护法长老'];
const DISCIPLES=['大师兄','二师兄','大师姐','二师姐','师弟','师妹','弟子'];

// 字段别名：远程站点用什么名字都在这张表里换算，别处不需要知道差异。
function pick(obj,keys){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&v!=='')return v;}return undefined;}
function cleanName(v){return String(v||'').trim();}
function asArray(v){return Array.isArray(v)?v:[];}
// 成员：远程可能用 title/role，也可能直接把掌门混在 members 里。
function mapMember(raw,allowed,fallback){
 if(!raw||typeof raw!=='object')return null;
 const name=cleanName(pick(raw,['name','nickname','title']) ?? '');
 if(!name)return null;
 const title=cleanName(pick(raw,['title','role','rank']));
 return {userId:cleanName(pick(raw,['userId','id','uid']))||('m-'+name),name,title:allowed.includes(title)?title:fallback};
}
// 单条远程门派 → 本项目字段；不合法返回 null（调用方跳过并计数，不整批失败）。
export function mapRemoteSect(raw){
 if(!raw||typeof raw!=='object')return null;
 const id=cleanName(pick(raw,['id','sectId','slug']));
 const name=cleanName(pick(raw,['name','sectName','title']));
 if(!id||!name)return null;
 const founder=typeof raw.founder==='object'?raw.founder:(typeof raw.leader==='object'?raw.leader:null);
 const founderName=cleanName(pick(founder,['name','nickname']) ?? pick(raw,['founderName','leaderName']) ?? '');
 const style=cleanName(pick(raw,['style','theme']));
 const createdAt=Number(pick(raw,['createdAt','created_at','createTime']))||0;
 // 三角色：elders/disciples 优先；只有 members 时按称号分堆（并按 id/名字去重，避免重复登记）。
 let elders=asArray(pick(raw,['elders','council'])).map(m=>mapMember(m,ELDERS,'长老')).filter(Boolean);
 let disciples=asArray(pick(raw,['disciples','students'])).map(m=>mapMember(m,DISCIPLES,'弟子')).filter(Boolean);
 const members=asArray(pick(raw,['members','roster']));
 if(members.length){
  const known=new Set([...elders,...disciples].map(m=>m.userId+'/'+m.name));
  for(const m of members){
   const title=cleanName(pick(m,['title','role','rank']));
   const row=DISCIPLES.includes(title)?mapMember(m,DISCIPLES,'弟子'):mapMember(m,ELDERS,'长老');
   if(!row||known.has(row.userId+'/'+row.name))continue;
   known.add(row.userId+'/'+row.name);
   (DISCIPLES.includes(title)?disciples:elders).push(row);
  }
 }
 elders=elders.filter(Boolean);disciples=disciples.filter(Boolean);
 return {
  id,name,
  slogan:cleanName(pick(raw,['slogan','tagline','motto']))||'',
  intro:cleanName(pick(raw,['intro','description','desc','brief']))||'',
  style:STYLES.includes(style)?style:'jianghu',
  founderId:cleanName(pick(founder,['id','userId','uid']) ?? pick(raw,['founderId','leaderId']) ?? '')||('remote-'+id),
  founderName:founderName||name,
  createdAt,
  elders,disciples,
 };
}
// 响应形态：{sects:[…]} / {items:[…]} / {data:[…]} / 裸数组都认。
export function mapRemotePayload(payload){
 const list=Array.isArray(payload)?payload:asArray(pick(payload,['sects','items','data','list']));
 const sects=[],skipped=[];
 for(const raw of list){
  const sect=mapRemoteSect(raw);
  if(sect)sects.push(sect);else skipped.push(raw);
 }
 return {sects,skipped};
}
function readJson(file,fallback){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}
}
function writeJsonAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(value,null,2));
 fs.renameSync(tmp,file);
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// 相对远程快照的差异：只记改动的字段，远程站点更新其他字段时不会被本地旧值顶掉。
export function diffPatch(base,current){
 const patch={};
 for(const f of PATCH_FIELDS)if(!same(base[f],current[f]))patch[f]=current[f];
 return patch;
}
// 深一层拷贝：浅拷贝会让 disciples/elders 数组仍是内部快照的同一个引用，
// 调用方（建派/加成员）往里 push 就会悄悄改掉远程基线，导致差异算不出来。
function cloneSect(s){
 return {...s,elders:(s.elders||[]).map(m=>({...m})),disciples:(s.disciples||[]).map(m=>({...m}))};
}
function applyOverlay(remote,overlay){
 const byId=new Map(remote.map(s=>[s.id,s]));
 const names=new Set(remote.map(s=>s.name));
 const list=remote.map(s=>{
  const patch=(overlay.patches||{})[s.id];
  return patch?{...cloneSect(s),...patch}:cloneSect(s);
 });
 for(const local of overlay.created||[]){
  if(byId.has(local.id)||names.has(local.name))continue; // 远程已有同名/id：以远程为准
  byId.set(local.id,local);names.add(local.name);list.push(local);
 }
 return list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
}

export class SectSource{
 constructor({base,token='',ttlMs=300000,dataDir,fetchImpl=fetch,timeoutMs=8000,onError}={}){
  this.base=String(base||'').replace(/\/+$/,'');
  this.token=token;this.ttlMs=Math.max(5000,Number(ttlMs)||300000);
  this.dataDir=dataDir;this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs;this.onError=onError;
  this.remote=[];this.overlay={created:[],patches:{}};
  this.lastSync=0;this.lastError=null;this.lastSkipped=0;this.timer=null;this.started=false;
 }
 get overlayFile(){return path.join(this.dataDir,OVERLAY);}
 get cacheFile(){return path.join(this.dataDir,CACHE);}
 get configured(){return !!this.base;}
 status(){
  return {kind:'remote',url:this.base,count:this.remote.length,
   syncedAt:this.lastSync,error:this.lastError,skipped:this.lastSkipped,
   localCreated:(this.overlay.created||[]).length,touched:Object.keys(this.overlay.patches||{}).length};
 }
 // 冷启动：磁盘缓存先顶上，避免网站慢/挂时大殿空场。
 restore(){
  const cached=readJson(this.cacheFile,null);
  if(cached&&Array.isArray(cached.sects)&&cached.sects.length){this.remote=cached.sects;this.lastSync=cached.syncedAt||0;}
  this.overlay=readJson(this.overlayFile,{created:[],patches:{}})||{created:[],patches:{}};
  return this.snapshot();
 }
 snapshot(){
  const overlay=readJson(this.overlayFile,{created:[],patches:{}})||{created:[],patches:{}};
  this.overlay=overlay;
  return applyOverlay(this.remote,overlay);
 }
 async refresh({force=false}={}){
  if(!this.configured)return this.snapshot();
  if(!force&&Date.now()-this.lastSync<this.ttlMs)return this.snapshot();
  try{
   const headers={Accept:'application/json'};
   if(this.token)headers.Authorization='Bearer '+this.token;
   const r=await this.fetchImpl(this.base+'/sects',{headers,signal:AbortSignal.timeout(this.timeoutMs)});
   if(!r.ok)throw new Error('远程返回 '+r.status);
   const ct=r.headers.get('content-type')||'';
   if(!ct.includes('json'))throw new Error('远程返回的不是 JSON（'+(ct||'无 content-type')+'）');
   const {sects,skipped}=mapRemotePayload(await r.json());
   this.remote=sects;this.lastSync=Date.now();this.lastError=null;this.lastSkipped=skipped.length;
   writeJsonAtomic(this.cacheFile,{syncedAt:this.lastSync,sects});
   if(skipped.length)this.onError?.('原子公社门派网站有 '+skipped.length+' 条数据不合规已跳过');
   return this.snapshot();
  }catch(error){
   // 失败不清空上一次快照：网站抖动时大殿照常开门。
   this.lastError=error.message||String(error);
   this.onError?.('门派网站同步失败（沿用上次快照）：'+this.lastError);
   return this.snapshot();
  }
 }
 start(){
  if(this.started||!this.configured)return;
  this.started=true;
  this.refresh({force:true}).catch(()=>{});
  this.timer=setInterval(()=>{this.refresh().catch(()=>{});},this.ttlMs);
  if(this.timer.unref)this.timer.unref();
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.started=false;}
 // 本地写入 → 覆盖层（远程站点暂未开放管理接口时的最小可用形态）。
 writeOverlay(merged){
  const byId=new Map(this.remote.map(s=>[s.id,s]));
  const prev=readJson(this.overlayFile,{created:[],patches:{}})||{created:[],patches:{}};
  const created=[],patches={...prev.patches};
  const seen=new Set();
  for(const s of merged||[]){
   if(!byId.has(s.id)){
    if(seen.has(s.id))continue;
    seen.add(s.id);created.push(s);continue;
   }
   const patch=diffPatch(byId.get(s.id),s);
   if(Object.keys(patch).length)patches[s.id]={...(prev.patches?.[s.id]||{}),...patch};
  }
  writeJsonAtomic(this.overlayFile,{created,patches});
  this.overlay={created,patches};
 }
}
