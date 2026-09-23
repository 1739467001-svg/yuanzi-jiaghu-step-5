// 发布状态存储：editions.json 是不可变基线，运营动作写成覆盖层并全程留痕。
// 公开读取（目录、详情、3D 展位、AI 检索）只认实时目录；撤回后各入口一致消失。
// 本地演示的写入层：先校验、再原子落盘；审计只追加不删除，回滚创建新的发布修订。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import rawEditions from '../src/data/editions.json' with {type:'json'};
import {normalizeCatalog,PUBLICATION_STATUSES} from '../src/content/catalog.js';

const root=path.resolve(import.meta.dirname,'..');
const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const overridesFile=()=>path.join(dataDir(),'publication-overrides.json');
const auditFile=()=>path.join(dataDir(),'audit-log.json');

function readJson(file,fallback){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}
}
function writeJsonAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(value,null,2));
 fs.renameSync(tmp,file);
}
export function getOverrides(){
 const stored=readJson(overridesFile(),null);
 if(!stored||typeof stored!=='object')return {stateVersion:0,editions:{},works:{}};
 return {stateVersion:Number(stored.stateVersion)||0,editions:stored.editions||{},works:stored.works||{}};
}
export function getStateVersion(){return getOverrides().stateVersion;}

function applyOverrides(editions,overrides){
 return editions.map(e=>{
  const patch=overrides.editions?.[e.id];
  const next=patch?{...e,...patch}:{...e};
  next.works=next.works.map(w=>{
   const wPatch=overrides.works?.[w.id];
   return wPatch?{...w,...wPatch}:{...w};
  });
  return next;
 });
}
let cached=null,cachedVersion=-1;
export function getLiveCatalog(){
 const overrides=getOverrides();
 if(cached&&cachedVersion===overrides.stateVersion)return cached;
 cached=normalizeCatalog(applyOverrides(rawEditions,overrides));
 cachedVersion=overrides.stateVersion;
 return cached;
}
export function livePublishedWorks(){
 const catalog=getLiveCatalog();
 return catalog.editions.filter(e=>e.publicationStatus==='已发布').flatMap(e=>e.works.filter(w=>w.publicationStatus==='已发布'));
}
export function anyLiveEdition(id){return getLiveCatalog().editions.find(e=>e.id===id)||null;}
export function anyLiveWork(id){return getLiveCatalog().editions.flatMap(e=>e.works).find(w=>w.id===id)||null;}
// 与 catalog.js 相同的查询语义，但只作用于实时目录：撤回后从检索中一致消失。
export function liveQueryWorks({editionId,track,q}={}){
 const needle=(q||'').trim().toLocaleLowerCase();
 return livePublishedWorks().filter(work=>
  (!editionId||work.editionId===editionId)&&
  (!track||track==='全部'||work.track===track)&&
  (!needle||[work.title,work.author,work.track,work.tagline,work.description,...(work.tags||[])].join(' ').toLocaleLowerCase().includes(needle)));
}
export function liveFindWork(id){return livePublishedWorks().find(w=>w.id===id)||null;}

export function getAudit(limit=100){
 const log=readJson(auditFile(),[]);
 return Array.isArray(log)?log.slice(-limit).reverse():[];
}
function appendAudit(event){
 const log=readJson(auditFile(),[]);
 const list=Array.isArray(log)?log:[];
 list.push(event);
 writeJsonAtomic(auditFile(),list);
}
function snapshotEdition(edition){
 return {
  edition:{publicationStatus:edition.publicationStatus,contentVersion:edition.contentVersion},
  works:Object.fromEntries(edition.works.map(w=>[w.id,{publicationStatus:w.publicationStatus,contentVersion:w.contentVersion}])),
 };
}
function commit(mutate,event){
 const before=getLiveCatalog();
 const target=event.targetId;
 const beforeSnapshot=event.scope==='edition'
  ?snapshotEdition(before.editions.find(e=>e.id===target))
  :{works:{[target]:(()=>{const w=before.editions.flatMap(e=>e.works).find(w=>w.id===target);return {publicationStatus:w.publicationStatus,contentVersion:w.contentVersion};})()}};
 const overrides=getOverrides();
 mutate(overrides);
 // 先按候选状态试算一遍，校验失败就不落盘。
 const candidate=normalizeCatalog(applyOverrides(rawEditions,overrides));
 const afterSnapshot=event.scope==='edition'
  ?snapshotEdition(candidate.editions.find(e=>e.id===target))
  :{works:{[target]:(()=>{const w=candidate.editions.flatMap(e=>e.works).find(w=>w.id===target);return {publicationStatus:w.publicationStatus,contentVersion:w.contentVersion};})()}};
 overrides.stateVersion=(Number(overrides.stateVersion)||0)+1;
 writeJsonAtomic(overridesFile(),overrides);
 cached=null;
 appendAudit({id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,actor:event.actor,action:event.action,targetId:target,scope:event.scope,before:beforeSnapshot,after:afterSnapshot,time:new Date().toISOString(),note:event.note||''});
 return {stateVersion:overrides.stateVersion,audit:getAudit(1)[0]};
}
function assertStatus(status){
 if(!PUBLICATION_STATUSES.includes(status))throw new Error(`非法的发布状态：${status}`);
}
function findTarget(kind,id){
 const catalog=getLiveCatalog();
 if(kind==='edition')return catalog.editions.find(e=>e.id===id)||null;
 return catalog.editions.flatMap(e=>e.works).find(w=>w.id===id)||null;
}
export function setEditionStatus(id,status,actor='local-admin',note=''){
 assertStatus(status);
 const current=findTarget('edition',id);
 if(!current)throw new Error(`赛事不存在：${id}`);
 return commit(o=>{o.editions=o.editions||{};o.editions[id]={publicationStatus:status,contentVersion:(Number(current.contentVersion)||1)+1};},{scope:'edition',targetId:id,action:status==='已发布'?'publish_edition':'withdraw_edition',actor,note});
}
export function setWorkStatus(id,status,actor='local-admin',note=''){
 assertStatus(status);
 const current=findTarget('work',id);
 if(!current)throw new Error(`作品不存在：${id}`);
 return commit(o=>{o.works=o.works||{};o.works[id]={publicationStatus:status,contentVersion:(Number(current.contentVersion)||1)+1};},{scope:'work',targetId:id,action:status==='已发布'?'publish_work':'withdraw_work',actor,note});
}
// 回滚：把指定审计事件记录之前的状态作为新的发布修订应用，不删除任何审计记录。
export function rollbackEdition(id,auditEventId,actor='local-admin'){
 const event=getAudit(500).find(e=>e.id===auditEventId&&e.targetId===id&&e.scope==='edition');
 if(!event)throw new Error('找不到可回滚的审计事件');
 const current=findTarget('edition',id);
 if(!current)throw new Error(`赛事不存在：${id}`);
 return commit(o=>{
  o.editions=o.editions||{};o.works=o.works||{};
  o.editions[id]={publicationStatus:event.before.edition.publicationStatus,contentVersion:(Number(current.contentVersion)||1)+1};
  for(const [workId,snap] of Object.entries(event.before.works||{}))o.works[workId]={publicationStatus:snap.publicationStatus,contentVersion:(Number(snap.contentVersion)||1)+1};
 },{scope:'edition',targetId:id,action:'rollback_edition',actor,note:`回滚到审计事件 ${auditEventId} 之前的状态`});
}
// 发布检查（PRD 11.4 可本地验证的子集）：必填字段、唯一标识、媒体可读、私人字段、展陈容量。
const PRIVATE_FIELDS=['wechat','qr','contact','phone','email'];
export function checkEditionPublishable(edition){
 const issues=[];
 if(!edition)return {ok:false,issues:['赛事不存在']};
 if(!edition.title||!edition.description)issues.push('缺少标题或介绍');
 if(!Array.isArray(edition.tracks)||!edition.tracks.length)issues.push('缺少赛道');
 const ids=edition.works.map(w=>w.id);
 if(new Set(ids).size!==ids.length)issues.push('作品 id 重复');
 for(const w of edition.works){
  for(const field of ['title','author','track','tagline','description'])if(!w[field])issues.push(`${w.id} 缺少${field}`);
  for(const field of PRIVATE_FIELDS)if(w[field])issues.push(`${w.id} 含私人字段 ${field}，不会随发布公开`);
  for(const media of ['poster','thumb']){
   const rel=String(w[media]||'').replace(/^\//,'');
   if(!rel)issues.push(`${w.id} 缺少${media}`);
   else if(!fs.existsSync(path.join(root,'public',rel)))issues.push(`${w.id} 的 ${media} 文件不存在：${rel}`);
  }
 }
 return {ok:issues.length===0,issues};
}
// 导入检查：读取来源展示站数据，与当前基线比较，只产出候选差异，不写任何状态。
export function importDryRun(){
 const sources=[
  {id:'funskills',folder:'繁星之夜-showcase',ext:'jpg'},
  {id:'hackathon',folder:'hackathon-showcase',ext:'webp'},
 ];
 const report={checkedAt:new Date().toISOString(),editions:[],totals:{new:0,updated:0,unchanged:0,missing:0}};
 for(const source of sources){
  const folder=path.join(root,'..','选手作品信息',source.folder);
  const dataFile=path.join(folder,'assets/data.js');
  if(!fs.existsSync(dataFile)){report.editions.push({id:source.id,error:'来源数据不存在'});continue;}
  const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(dataFile,'utf8'),ctx);
  const baselineEdition=rawEditions.find(e=>e.id===source.id);
  const existing=new Map((baselineEdition?.works||[]).map(w=>[w.id,w]));
  const seen=new Set();
  const items=[];
  for(const w of ctx.window.WORKS||[]){
   const id=source.id+'--'+w.slug;seen.add(id);
   const old=existing.get(id);
   const candidate={title:w.title,author:w.author,track:w.track,tagline:w.tagline,description:w.blurb};
   if(!old){items.push({id,status:'new',title:w.title});report.totals.new++;}
   else{
    const changed=['title','author','track','tagline','description'].some(k=>String(old[k]||'')!==String(candidate[k]||''));
    if(changed){items.push({id,status:'updated',title:w.title});report.totals.updated++;}
    else{items.push({id,status:'unchanged',title:w.title});report.totals.unchanged++;}
   }
  }
  for(const id of existing.keys())if(!seen.has(id)){items.push({id,status:'missing',title:existing.get(id).title});report.totals.missing++;}
  report.editions.push({id:source.id,source:`选手作品信息/${source.folder}/assets/data.js`,items,privateExcluded:'微信号、二维码与联系方式不进入导入'});
 }
 return report;
}
// 稳定分页：顺序即目录顺序（赛事顺序 + 作品顺序），分页不改变排序。
export function stablePage(items,{limit=50,offset=0}={}){
 const size=Math.max(1,Math.min(200,Number(limit)||50));
 const start=Math.max(0,Number(offset)||0);
 return {items:items.slice(start,start+size),total:items.length,limit:size,offset:start};
}
export function adminToken(env){return env.ATOM_ADMIN_TOKEN||'atom-local-demo';}
export function isAdminRequest(req,env){
 const header=req.headers['x-atom-admin'];
 return typeof header==='string'&&header===adminToken(env);
}
