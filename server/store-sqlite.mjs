// SQLite 存储后端（ATOM_STORE=sqlite 时启用）：账号/会话、私人记忆、关注三个域。
// 与 JSON 后端（accounts.mjs / memories.mjs / follows.mjs）导出完全相同的函数签名，
// 上层经 server/store.mjs 调度，不关心后端。选型对比与迁移路径见 docs/STORAGE.md。
//
// 相对 JSON 后端解决的真实问题：事务消灭读-改-写竞态、索引替代线性扫描、
// 会话命中过期即懒清理、写入只动涉及的页、WAL 让读不阻塞写。
// 管理域（发布/审计/预算/门派/嵌入缓存）的同款后端在 server/store-sqlite-pub.mjs，
// 两者共用 server/sqlite-db.mjs 的连接与表结构。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {MODELS} from '../src/world/config.js';
import {validName,validColor,hashPassword,publicUser,SESSION_DAYS} from './accounts.mjs';
import {MAX_PER_AGENT,DEFAULT_TTL_DAYS,rankMemories,recallRankedAsync} from './memories.mjs';
import {getDb,tx,databaseFile} from './sqlite-db.mjs';

const MODEL_KEYS=Object.keys(MODELS);
export {databaseFile};
// 记忆存储版本号：每次保存/删除递增，供上层丢弃在途结果（与 JSON 后端同语义）。
function bumpMemoryVersion(){
 getDb().prepare("INSERT INTO meta(key,value) VALUES('memories_version',1) ON CONFLICT(key) DO UPDATE SET value=value+1").run();
}

// ---------- 账号与会话 ----------
export function register(name,password,color='#427ab5'){
 const display=String(name||'').trim();
 if(!validName(display))throw new Error('名帖昵称需要 1—20 个字符');
 if(typeof password!=='string'||[...password].length<6)throw new Error('密码至少 6 位');
 if(!validColor(color))throw new Error('衣带颜色格式不正确');
 return tx(db=>{
  if(db.prepare('SELECT id FROM users WHERE name=?').get(display))throw new Error('这个名帖昵称已被使用');
  const salt=crypto.randomBytes(16).toString('hex');
  const user={id:`u-${crypto.randomBytes(8).toString('hex')}`,name:display,color,salt,passHash:hashPassword(password,salt),createdAt:new Date().toISOString()};
  db.prepare('INSERT INTO users(id,name,color,salt,pass_hash,external_id,model,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(user.id,user.name,user.color,user.salt,user.passHash,null,null,user.createdAt);
  return publicUser(user);
 });
}
export function login(name,password){
 const display=String(name||'').trim();
 const row=getDb().prepare('SELECT * FROM users WHERE name=?').get(display);
 if(!row||row.pass_hash!==hashPassword(String(password||''),row.salt))throw new Error('名帖昵称或密码不正确');
 const token=crypto.randomBytes(24).toString('hex');
 tx(db=>{
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
   .run(token,row.id,Date.now(),Date.now()+SESSION_DAYS*86400000);
 });
 return {token,user:{id:row.id,name:row.name,color:row.color,createdAt:row.created_at}};
}
// 签发本地会话（外部身份验证通过后使用）。
export function issueSession(userId){
 const token=crypto.randomBytes(24).toString('hex');
 tx(db=>{
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
   .run(token,userId,Date.now(),Date.now()+SESSION_DAYS*86400000);
 });
 return token;
}
export function logout(token){
 const result=getDb().prepare('DELETE FROM sessions WHERE token=?').run(token);
 return Number(result.changes)>0;
}
export function verify(token){
 if(typeof token!=='string'||!token)return null;
 const db=getDb();
 const row=db.prepare('SELECT s.expires_at,u.id,u.name,u.color,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
 if(!row)return null;
 if(row.expires_at<Date.now()){
  // 懒清理：命中过期会话直接删掉，不等别人登录时才被扫走。
  db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  return null;
 }
 return {userId:row.id,user:{id:row.id,name:row.name,color:row.color,createdAt:row.created_at}};
}
export function updateProfile(token,{name,color,model}={}){
 const session=verify(token);
 if(!session)throw new Error('登录状态已失效，请重新登录');
 const row=getDb().prepare('SELECT * FROM users WHERE id=?').get(session.userId);
 if(!row)throw new Error('登录状态已失效，请重新登录');
 const next={name:row.name,color:row.color,model:row.model};
 if(name!==undefined){
  const display=String(name||'').trim();
  if(!validName(display))throw new Error('名帖昵称需要 1—20 个字符');
  next.name=display;
 }
 if(color!==undefined){
  if(!validColor(color))throw new Error('衣带颜色格式不正确');
  next.color=color;
 }
 if(model!==undefined){
  // 形象只能是清单里登记过的模型键；传 null 表示用回默认形象。
  if(model!==null&&!MODEL_KEYS.includes(model))throw new Error('角色形象不存在');
  next.model=model||null;
 }
 tx(db=>{
  if(next.name!==row.name&&db.prepare('SELECT id FROM users WHERE name=? AND id<>?').get(next.name,row.id))
   throw new Error('这个名帖昵称已被使用');
  db.prepare('UPDATE users SET name=?,color=?,model=? WHERE id=?').run(next.name,next.color,next.model,row.id);
 });
 return {id:row.id,name:next.name,color:next.color,createdAt:row.created_at};
}
// 外部身份映射：同一 subject 始终映射到同一本地账号（首次登录自动建档）。
export function findOrCreateExternal(subject,name){
 return tx(db=>{
  const existing=db.prepare('SELECT * FROM users WHERE external_id=?').get(subject);
  if(existing){
   let display=existing.name;
   if(name&&name!==existing.name){
    const candidate=String(name).trim();
    if(candidate&&!db.prepare('SELECT id FROM users WHERE name=? AND id<>?').get(candidate,existing.id)){
     db.prepare('UPDATE users SET name=? WHERE id=?').run(candidate,existing.id);
     display=candidate;
    }
   }
   return {id:existing.id,name:display,color:existing.color,createdAt:existing.created_at};
  }
  const base=String(name||'社区侠客').trim()||'社区侠客';
  let display=base,i=2;
  while(db.prepare('SELECT id FROM users WHERE name=?').get(display))display=`${base}${i++}`;
  const user={id:`u-${crypto.randomBytes(8).toString('hex')}`,name:display,color:'#427ab5',createdAt:new Date().toISOString()};
  db.prepare('INSERT INTO users(id,name,color,salt,pass_hash,external_id,model,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(user.id,user.name,user.color,'','',subject,null,user.createdAt);
  return publicUser(user);
 });
}

// ---------- 私人记忆 ----------
const rowToEntry=row=>({id:row.id,userId:row.account_id,agentId:row.agent_id,text:row.text,source:row.source,kind:row.kind,createdAt:row.created_at,expiresAt:row.expires_at});
export function listMemories(userId,agentId){
 const db=getDb();
 const rows=agentId
  ?db.prepare('SELECT * FROM memories WHERE account_id=? AND agent_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC').all(userId,agentId,Date.now())
  :db.prepare('SELECT * FROM memories WHERE account_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC').all(userId,Date.now());
 return rows.map(rowToEntry);
}
export function saveMemory(userId,agentId,text,{source='你主动表达的兴趣',kind='interest',ttlDays=DEFAULT_TTL_DAYS}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('记忆内容不能为空');
 const entry={id:`mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,userId,agentId,text:[...text].slice(0,300).join(''),source:String(source).slice(0,60),kind:String(kind).slice(0,20),createdAt:Date.now(),expiresAt:ttlDays>0?Date.now()+ttlDays*86400000:null};
 return tx(db=>{
  db.prepare('INSERT INTO memories(id,account_id,agent_id,text,source,kind,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(entry.id,entry.userId,entry.agentId,entry.text,entry.source,entry.kind,entry.createdAt,entry.expiresAt);
  // 每个 (用户, 角色) 有界，超出淘汰最旧（与 JSON 后端同口径：不看是否已过期）。
  const scoped=db.prepare('SELECT id FROM memories WHERE account_id=? AND agent_id=? ORDER BY created_at ASC').all(userId,agentId);
  if(scoped.length>MAX_PER_AGENT){
   const drop=db.prepare('DELETE FROM memories WHERE id=?');
   for(const row of scoped.slice(0,scoped.length-MAX_PER_AGENT))drop.run(row.id);
  }
  bumpMemoryVersion();
  return entry;
 });
}
export function deleteMemory(userId,id){
 return tx(db=>{
  const result=db.prepare('DELETE FROM memories WHERE id=? AND account_id=?').run(id,userId);
  const removed=Number(result.changes)>0;
  if(removed)bumpMemoryVersion();
  return removed;
 });
}
export function deleteAllMemories(userId,agentId){
 return tx(db=>{
  const result=agentId
   ?db.prepare('DELETE FROM memories WHERE account_id=? AND agent_id=?').run(userId,agentId)
   :db.prepare('DELETE FROM memories WHERE account_id=?').run(userId);
  bumpMemoryVersion();
  return Number(result.changes)||0;
 });
}
export function storeVersion(){
 const row=getDb().prepare("SELECT value FROM meta WHERE key='memories_version'").get();
 return row?Number(row.value)||0:0;
}
export function recallMemories(userId,agentId,query='',limit=8){
 return rankMemories(listMemories(userId,agentId),query,limit);
}
export async function recallMemoriesAsync(userId,agentId,query='',limit=8){
 return recallRankedAsync(listMemories(userId,agentId),query,limit);
}
// 迁移：把本机旧记忆写入账号（用户选择后调用），返回迁移条数。
export function importMemories(userId,items){
 if(!Array.isArray(items)||!items.length)return 0;
 let count=0;
 for(const item of items){
  if(!item||typeof item.text!=='string'||!item.text.trim()||typeof item.agentId!=='string'||!item.agentId.trim())continue;
  try{saveMemory(userId,item.agentId,[...item.text].slice(0,300).join(''),{source:String(item.source||'从本机迁移').slice(0,60),kind:String(item.kind||'interest').slice(0,20)});count++;}catch{}
 }
 return count;
}

// ---------- 关注 ----------
const rowToFollow=row=>({userId:row.account_id,targetType:row.target_type,targetId:row.target_id,createdAt:row.created_at});
export function listFollows(userId,targetType){
 const db=getDb();
 const rows=targetType
  ?db.prepare('SELECT * FROM follows WHERE account_id=? AND target_type=? ORDER BY created_at DESC').all(userId,targetType)
  :db.prepare('SELECT * FROM follows WHERE account_id=? ORDER BY created_at DESC').all(userId);
 return rows.map(rowToFollow);
}
export function isFollowing(userId,targetType,targetId){
 return !!getDb().prepare('SELECT 1 FROM follows WHERE account_id=? AND target_type=? AND target_id=?').get(userId,targetType,targetId);
}
export function addFollow(userId,targetType,targetId){
 if(!['player','ai'].includes(targetType))throw new Error('关注类型不正确');
 if(typeof targetId!=='string'||!targetId)throw new Error('缺少关注对象');
 return tx(db=>{
  if(db.prepare('SELECT 1 FROM follows WHERE account_id=? AND target_type=? AND target_id=?').get(userId,targetType,targetId))
   return {ok:true,duplicate:true};
  db.prepare('INSERT INTO follows(target_type,target_id,account_id,created_at) VALUES(?,?,?,?)').run(targetType,targetId,userId,Date.now());
  return {ok:true,duplicate:false};
 });
}
export function removeFollow(userId,targetType,targetId){
 const result=getDb().prepare('DELETE FROM follows WHERE account_id=? AND target_type=? AND target_id=?').run(userId,targetType,targetId);
 return {ok:true,removed:Number(result.changes)>0};
}

// ---------- 一次性迁移：JSON → SQLite ----------
// 把 data/accounts.json、memories.json、follows.json 灌进库；幂等可重跑
// （users/sessions/memories 用 INSERT OR REPLACE，follows 用 INSERT OR IGNORE）。
// 记忆版本号取 JSON 与库中较大值。建议在服务端停止时执行（scripts/migrate-json-to-sqlite.mjs）。
export function migrateFromJson({dataDir:dir=path.dirname(databaseFile())}={}){
 const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));}catch{return fallback;}};
 const result={users:0,sessions:0,memories:0,follows:0,memoryVersion:0};
 tx(db=>{
  const accounts=readJson('accounts.json',null);
  if(accounts&&typeof accounts==='object'){
   const insertUser=db.prepare('INSERT OR REPLACE INTO users(id,name,color,salt,pass_hash,external_id,model,created_at) VALUES(?,?,?,?,?,?,?,?)');
   for(const user of Object.values(accounts.users||{})){
    insertUser.run(user.id,user.name,user.color,user.salt,user.passHash,user.externalId??null,user.model??null,user.createdAt);
    result.users++;
   }
   const insertSession=db.prepare('INSERT OR REPLACE INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)');
   for(const [token,session] of Object.entries(accounts.sessions||{})){
    insertSession.run(token,session.userId,Number(session.createdAt)||0,Number(session.expiresAt)||0);
    result.sessions++;
   }
  }
  const memories=readJson('memories.json',null);
  if(memories&&Array.isArray(memories.entries)){
   const insertMemory=db.prepare('INSERT OR REPLACE INTO memories(id,account_id,agent_id,text,source,kind,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)');
   for(const entry of memories.entries){
    insertMemory.run(entry.id,entry.userId,entry.agentId,entry.text,entry.source,entry.kind,Number(entry.createdAt)||0,entry.expiresAt??null);
    result.memories++;
   }
   result.memoryVersion=Number(memories.version)||0;
  }
  const follows=readJson('follows.json',null);
  if(follows&&Array.isArray(follows.items)){
   const insertFollow=db.prepare('INSERT OR IGNORE INTO follows(target_type,target_id,account_id,created_at) VALUES(?,?,?,?)');
   for(const follow of follows.items)result.follows+=Number(insertFollow.run(follow.targetType,follow.targetId,follow.userId,Number(follow.createdAt)||0).changes)||0;
  }
  const current=db.prepare("SELECT value FROM meta WHERE key='memories_version'").get();
  const version=Math.max(result.memoryVersion,current?Number(current.value)||0:0);
  db.prepare("INSERT INTO meta(key,value) VALUES('memories_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(version);
 });
 return result;
}
