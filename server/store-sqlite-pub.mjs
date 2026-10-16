// 管理域 SQLite 后端（ATOM_STORE=sqlite 时启用）：发布覆盖层、审计、预算账本、
// 门派库与同步缓存/覆盖层、嵌入向量缓存。与各 JSON 模块的 I/O 语义一一对应；
// 纯逻辑（目录规范化、门限计算、字段映射）仍留在原模块，这里只做存储。
//
// 相对 JSON 的真实改进：
//   - 审计从「按月分片 + 合并读取」变为追加式表（只 INSERT，时间索引查询），轮转不再需要；
//   - 预算账本不再每次调用全量重写（requests 只增不减，JSON 下文件只涨）；
//   - 覆盖层与审计同一个事务落盘，不会出现「状态变了但审计丢了」的中间态；
//   - 门派库/同步缓存/覆盖层/嵌入缓存统一进 kv/embeddings 表，读-改-写全程事务。
import fs from 'node:fs';
import path from 'node:path';
import {getDb,tx,databaseFile} from './sqlite-db.mjs';

export {databaseFile};
const kvGet=(db,key)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?row.value:null;};
const kvGetJson=(db,key,fallback)=>{const raw=kvGet(db,key);if(raw==null)return fallback;try{return JSON.parse(raw);}catch{return fallback;}};
const kvSetJson=(db,key,value)=>{db.prepare("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,JSON.stringify(value));};

// ---------- 发布覆盖层（kv 单文档） ----------
const EMPTY_OVERRIDES={stateVersion:0,editions:{},works:{},added:[]};
export function readOverrides(){
 const doc=kvGetJson(getDb(),'pub_overrides',null);
 if(!doc||typeof doc!=='object')return {...EMPTY_OVERRIDES};
 return {stateVersion:Number(doc.stateVersion)||0,editions:doc.editions||{},works:doc.works||{},added:Array.isArray(doc.added)?doc.added:[]};
}
export function writeOverrides(overrides){
 tx(db=>kvSetJson(db,'pub_overrides',overrides));
}
// 覆盖层与审计同一个事务：要么都落盘，要么都回滚。
export function writeOverridesWithAudit(overrides,auditEvent){
 tx(db=>{kvSetJson(db,'pub_overrides',overrides);insertAudit(db,auditEvent);});
}

// ---------- 审计（追加式表） ----------
function insertAudit(db,e){
 db.prepare('INSERT OR REPLACE INTO audit_events(id,time,actor,action,target_id,scope,before_json,after_json,note) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(e.id,e.time,e.actor,e.action,e.targetId,e.scope,JSON.stringify(e.before??null),JSON.stringify(e.after??null),e.note||'');
}
export function appendAudit(event){tx(db=>insertAudit(db,event));}
const rowToEvent=r=>({id:r.id,actor:r.actor,action:r.action,targetId:r.target_id,scope:r.scope,before:JSON.parse(r.before_json||'null'),after:JSON.parse(r.after_json||'null'),time:r.time,note:r.note});
// 最近 limit 条，新的在前（与 JSON 后端 getAudit 的口径一致：时间倒序，同日按 id 倒序）。
export function readAudit(limit=100){
 return getDb().prepare('SELECT * FROM audit_events ORDER BY time DESC, id DESC LIMIT ?').all(Math.max(1,Number(limit)||100)).map(rowToEvent);
}

// ---------- 预算账本（requests/days 两张表） ----------
const requestRowToRecord=r=>({requestId:r.request_id,status:r.status,tokens:{in:r.tokens_in||0,out:r.tokens_out||0},cost:r.cost,model:r.model,time:r.time,settledAt:r.settled_at||undefined});
export function budgetDayUsage(day){
 const row=getDb().prepare('SELECT cost,calls FROM budget_days WHERE day=?').get(day);
 return row?{cost:row.cost||0,calls:row.calls||0}:{cost:0,calls:0};
}
// 预留：与 JSON 版同序——先查重（重复不计费），再并发位，再日预算/次数门。
// status 由调用方（budget.mjs 的 gate）算好传入，门限规则只有一份。
export function budgetReserve({requestId,tokens,cost,day,time,status,active,maxConcurrent}){
 return tx(db=>{
  const existing=db.prepare('SELECT * FROM budget_requests WHERE request_id=?').get(requestId);
  if(existing)return {ok:true,duplicate:true,record:requestRowToRecord(existing)};
  if(active>=maxConcurrent)return {ok:false,reason:'concurrency'};
  if(status.level==='stop')return {ok:false,reason:status.reason};
  db.prepare('INSERT INTO budget_requests(request_id,status,model,tokens_in,tokens_out,cost,time,settled_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(requestId,'reserved',null,Number(tokens?.in)||0,Number(tokens?.out)||0,cost,time,null);
  // 与 JSON 版同口径：当天费用累加并按 1e6 取整。
  db.prepare("INSERT INTO budget_days(day,cost,calls) VALUES(?,?,0) ON CONFLICT(day) DO UPDATE SET cost=round((cost+excluded.cost)*1000000)/1000000")
   .run(day,cost);
  return {ok:true,reservation:{requestId,status:'reserved',tokens:{in:Number(tokens?.in)||0,out:Number(tokens?.out)||0},cost,model:null,time}};
 });
}
// 结算：按实际用量修正当天聚合；重复结算忽略（记录状态必须是 reserved）。
export function budgetSettle({requestId,tokens,cost,status='ok',model=null,settledAt,day}){
 return tx(db=>{
  const record=db.prepare('SELECT * FROM budget_requests WHERE request_id=?').get(requestId);
  if(!record||record.status!=='reserved')return {duplicate:true,record:record?requestRowToRecord(record):null};
  db.prepare('UPDATE budget_requests SET status=?,model=?,tokens_in=?,tokens_out=?,cost=?,settled_at=? WHERE request_id=?')
   .run(status,model,Number(tokens?.in)||0,Number(tokens?.out)||0,cost,settledAt,requestId);
  // 与 JSON 版同口径：费用 = 原当天 - 预留 + 实际（下限 0），成功调用才计次数。
  const costDelta=Math.round((cost-(record.cost||0))*1e6)/1e6;
  const calls=status==='ok'?1:0;
  db.prepare("INSERT INTO budget_days(day,cost,calls) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET cost=max(0,round((cost+excluded.cost)*1000000)/1000000),calls=calls+excluded.calls")
   .run(day,Math.max(0,costDelta),calls);
  return {record:requestRowToRecord(db.prepare('SELECT * FROM budget_requests WHERE request_id=?').get(requestId))};
 });
}

// ---------- 门派库与同步（kv 单文档） ----------
export function readSectsDoc(){
 const doc=kvGetJson(getDb(),'sects',null);
 return doc&&typeof doc==='object'&&Array.isArray(doc.sects)?doc:null;
}
export function writeSectsDoc(doc){tx(db=>kvSetJson(db,'sects',doc));}
// 门派网站同步：磁盘缓存（冷启动兜底）与本地覆盖层各是一个 kv 文档。
export function readSectsCache(){
 const doc=kvGetJson(getDb(),'sects_cache',null);
 return doc&&Array.isArray(doc.sects)?doc:null;
}
export function writeSectsCache(doc){tx(db=>kvSetJson(db,'sects_cache',doc));}
export function readSectsOverlay(){
 const doc=kvGetJson(getDb(),'sects_overlay',null);
 return doc&&typeof doc==='object'?doc:{created:[],patches:{}};
}
export function writeSectsOverlay(doc){tx(db=>kvSetJson(db,'sects_overlay',doc));}

// ---------- 嵌入向量缓存（hash → vector） ----------
export function readEmbeddingCache(){
 const rows=getDb().prepare('SELECT hash,vector FROM embeddings').all();
 const cache={};
 for(const row of rows){try{cache[row.hash]=JSON.parse(row.vector);}catch{}}
 return cache;
}
// 只写新增/变化的条目（JSON 版是全量重写；文本库大时这里只动涉及的行）。
export function writeEmbeddingEntries(entries){
 if(!entries||!Object.keys(entries).length)return;
 tx(db=>{
  const stmt=db.prepare('INSERT OR REPLACE INTO embeddings(hash,vector) VALUES(?,?)');
  for(const [hash,vector] of Object.entries(entries))stmt.run(hash,JSON.stringify(vector));
 });
}

// ---------- 一次性迁移：JSON → SQLite（管理域） ----------
// 把 publication-overrides.json、audit-log*.json（含旧单文件）、usage-ledger.json、
// sects.json、sects-overlay.json、sects-cache.json、embedding-cache.json 灌进库。
// 幂等可重跑；建议在服务端停止时执行（scripts/migrate-json-to-sqlite.mjs 调用）。
export function migratePubFromJson({dataDir:dir=path.dirname(databaseFile())}={}){
 const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));}catch{return fallback;}};
 const listAuditFiles=()=>{try{return fs.readdirSync(dir).filter(f=>/^audit-log.*\.json$/.test(f)).sort();}catch{return [];}};
 const result={overrides:false,audit:0,budgetRequests:0,budgetDays:0,sects:false,sectsOverlay:false,sectsCache:false,embeddings:0};
 tx(db=>{
  const overrides=readJson('publication-overrides.json',null);
  if(overrides&&typeof overrides==='object'){kvSetJson(db,'pub_overrides',overrides);result.overrides=true;}
  for(const file of listAuditFiles()){
   const log=readJson(file,[]);
   if(!Array.isArray(log))continue;
   for(const e of log){
    if(!e||!e.id)continue;
    insertAudit(db,e);
    result.audit++;
   }
  }
  const ledger=readJson('usage-ledger.json',null);
  if(ledger&&typeof ledger==='object'){
   for(const [id,r] of Object.entries(ledger.requests||{})){
    db.prepare('INSERT OR REPLACE INTO budget_requests(request_id,status,model,tokens_in,tokens_out,cost,time,settled_at) VALUES(?,?,?,?,?,?,?,?)')
     .run(id,r.status,r.model??null,Number(r.tokens?.in)||0,Number(r.tokens?.out)||0,Number(r.cost)||0,r.time||'',r.settledAt||null);
    result.budgetRequests++;
   }
   for(const [day,d] of Object.entries(ledger.days||{})){
    db.prepare('INSERT OR REPLACE INTO budget_days(day,cost,calls) VALUES(?,?,?)').run(day,Number(d.cost)||0,Number(d.calls)||0);
    result.budgetDays++;
   }
  }
  const sects=readJson('sects.json',null);
  if(sects&&Array.isArray(sects.sects)){kvSetJson(db,'sects',sects);result.sects=true;}
  const overlay=readJson('sects-overlay.json',null);
  if(overlay&&typeof overlay==='object'){kvSetJson(db,'sects_overlay',overlay);result.sectsOverlay=true;}
  const cache=readJson('sects-cache.json',null);
  if(cache&&typeof cache==='object'){kvSetJson(db,'sects_cache',cache);result.sectsCache=true;}
  const embeds=readJson('embedding-cache.json',null);
  if(embeds&&typeof embeds==='object'){
   const stmt=db.prepare('INSERT OR REPLACE INTO embeddings(hash,vector) VALUES(?,?)');
   for(const [hash,vector] of Object.entries(embeds)){
    if(!Array.isArray(vector))continue;
    stmt.run(hash,JSON.stringify(vector));
    result.embeddings++;
   }
  }
 });
 return result;
}
