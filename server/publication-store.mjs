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
 if(!stored||typeof stored!=='object')return {stateVersion:0,editions:{},works:{},added:[]};
 return {stateVersion:Number(stored.stateVersion)||0,editions:stored.editions||{},works:stored.works||{},added:Array.isArray(stored.added)?stored.added:[]};
}
export function getStateVersion(){return getOverrides().stateVersion;}

function applyOverrides(editions,overrides){
 const patched=editions.map(e=>{
  const patch=overrides.editions?.[e.id];
  const next=patch?{...e,...patch}:{...e};
  next.works=next.works.map(w=>{
   const wPatch=overrides.works?.[w.id];
   return wPatch?{...w,...wPatch}:{...w};
  });
  return next;
 });
 // 导入层（added）：整赛事快照。既有赛事按快照替换作品集合，但保留仍在集合内的作品的
 // 撤回状态与赛事级撤回状态；快照里没有的字段（如展陈布局）沿用基线，重复导入即替换。
 const added=Array.isArray(overrides.added)?overrides.added:[];
 if(!added.length)return patched;
 const merged=patched.map(e=>{
  const snap=added.find(a=>a.id===e.id);
  if(!snap)return e;
  const ePatch=overrides.editions?.[e.id];
  const works=snap.works.map(w=>{
   const wPatch=overrides.works?.[w.id];
   return wPatch?{...w,...wPatch}:{...w};
  });
  return {...e,...snap,works,publicationStatus:ePatch?.publicationStatus||snap.publicationStatus||'已发布'};
 });
 for(const snap of added)if(!merged.some(e=>e.id===snap.id)){
  // 新赛事同样要应用状态覆盖：作品级（导入后撤回的作品，重新导入不复活）
  // 与赛事级（导入后撤回整届赛事，公开入口一致消失）。
  const ePatch=overrides.editions?.[snap.id];
  merged.push({...snap,works:snap.works.map(w=>{
   const wPatch=overrides.works?.[w.id];
   return wPatch?{...w,...wPatch}:{...w};
  }),publicationStatus:ePatch?.publicationStatus||snap.publicationStatus||'已发布'});
 }
 return merged;
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
// ---------- 赛事导入工作台（运营后台） ----------
// 载荷形状：{ editions:[ edition, ... ] }，edition 为完整赛事快照（works 内作品须带
// `<赛事id>--` 前缀的稳定 id）。语义：新赛事整体进入导入层；既有赛事按快照替换作品集合，
// 保留仍在集合内的作品的撤回状态；媒体文件必须已在 public/ 下（导入不搬运二进制）。
function validateImportEditions(payload){
 const editions=payload&&payload.editions;
 if(!Array.isArray(editions)||!editions.length)throw new Error('载荷必须是包含 editions 数组的对象');
 const ids=editions.map(e=>e&&e.id);
 if(ids.some(id=>typeof id!=='string'||!id))throw new Error('每个赛事必须有字符串 id');
 if(new Set(ids).size!==ids.length)throw new Error('赛事 id 重复');
 const issues=[];
 for(const e of editions){
  if(!e.title||!e.subtitle||!e.description)issues.push(`${e.id} 缺少标题/副标题/介绍`);
  if(!Array.isArray(e.tracks)||!e.tracks.some(t=>typeof t==='string'&&t))issues.push(`${e.id} 缺少赛道`);
  if(!Array.isArray(e.works)||!e.works.length)issues.push(`${e.id} 没有作品`);
  const wids=(e.works||[]).map(w=>w&&w.id);
  if(wids.some(id=>typeof id!=='string'||!id))issues.push(`${e.id} 存在没有 id 的作品`);
  if(new Set(wids.filter(Boolean)).size!==wids.filter(Boolean).length)issues.push(`${e.id} 作品 id 重复`);
  for(const w of e.works||[]){
   if(!w.id||!String(w.id).startsWith(e.id+'--'))issues.push(`${w.id||'(无id)'} 的 id 必须以 ${e.id}-- 开头`);
   for(const field of ['title','author','track','tagline','description'])if(!w[field])issues.push(`${w.id} 缺少${field}`);
   for(const field of PRIVATE_FIELDS)if(w[field])issues.push(`${w.id} 含私人字段 ${field}，不会随导入公开`);
   for(const media of ['poster','thumb']){
    const rel=String(w[media]||'').replace(/^\//,'');
    if(!rel)issues.push(`${w.id} 缺少${media}`);
    else if(!fs.existsSync(path.join(root,'public',rel)))issues.push(`${w.id} 的 ${media} 文件不存在：${rel}`);
   }
  }
 }
 return issues;
}
// 预检（不写状态）：与当前实时目录比较，产出新增/更新/未变化/将消失与问题清单。
export function importCheck(payload){
 const issues=validateImportEditions(payload);
 const live=getLiveCatalog();
 const existing=new Map(live.editions.map(e=>[e.id,e]));
 const report={checkedAt:new Date().toISOString(),editions:[],totals:{new:0,updated:0,unchanged:0,missing:0},issues,ok:issues.length===0};
 for(const e of payload.editions){
  const old=existing.get(e.id);
  const oldWorks=new Map((old?.works||[]).map(w=>[w.id,w]));
  const items=[],seen=new Set();
  for(const w of e.works){
   seen.add(w.id);
   const prev=oldWorks.get(w.id);
   const candidate={title:w.title,author:w.author,track:w.track,tagline:w.tagline,description:w.description};
   if(!prev){items.push({id:w.id,status:'new',title:w.title});report.totals.new++;}
   else if(['title','author','track','tagline','description'].some(k=>String(prev[k]||'')!==String(candidate[k]||''))){items.push({id:w.id,status:'updated',title:w.title});report.totals.updated++;}
   else{items.push({id:w.id,status:'unchanged',title:w.title});report.totals.unchanged++;}
  }
  for(const [id,w] of oldWorks)if(!seen.has(id)){items.push({id,status:'missing',title:w.title});report.totals.missing++;}
  report.editions.push({id:e.id,title:e.title,isNew:!old,items});
 }
 return report;
}
// 执行导入：校验→合并→试算→原子落盘→审计→stateVersion 递增。校验失败不写任何状态。
export function applyImport(payload,actor='local-admin',note=''){
 const issues=validateImportEditions(payload);
 if(issues.length)throw new Error('导入校验未通过：'+issues.slice(0,5).join('；'));
 const report=importCheck(payload);
 const overrides=getOverrides();
 const added=Array.isArray(overrides.added)?overrides.added:[];
 // 同一赛事再次导入=替换快照，其余保留。
 overrides.added=added.filter(e=>!payload.editions.some(p=>p.id===e.id))
  .concat(payload.editions.map(e=>({...e,works:e.works.map(w=>({...w}))})));
 // 试算：合并结果必须能通过规范化，否则不落盘。
 const candidate=normalizeCatalog(applyOverrides(rawEditions,overrides));
 if(!candidate.editions.some(e=>payload.editions.some(p=>p.id===e.id)))throw new Error('导入合并失败：赛事未出现在合并结果中');
 overrides.stateVersion=(Number(overrides.stateVersion)||0)+1;
 writeJsonAtomic(overridesFile(),overrides);
 cached=null;
 const ids=payload.editions.map(e=>e.id);
 appendAudit({id:`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,actor,action:'import_editions',targetId:ids.join(','),scope:'catalog',
  before:{editions:0,works:0},
  after:{editions:ids.length,works:report.totals.new+report.totals.updated+report.totals.unchanged,newWorks:report.totals.new,updatedWorks:report.totals.updated,unchangedWorks:report.totals.unchanged,removedWorks:report.totals.missing},
  time:new Date().toISOString(),note:note||'运营后台导入'});
 return {stateVersion:overrides.stateVersion,report,audit:getAudit(1)[0]};
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
