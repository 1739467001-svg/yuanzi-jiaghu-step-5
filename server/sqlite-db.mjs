// SQLite 连接与表结构（所有存储域共用）：data/atom.db，WAL + 事务。
// 账号/会话/记忆/关注（store-sqlite.mjs）与管理域（store-sqlite-pub.mjs：
// 发布覆盖层/审计/预算账本/门派/嵌入缓存）共用这一个连接与同一份 schema。
//
// node:sqlite 惰性加载：静态 import 会被 esbuild 打进 vite 配置包并提升执行——
// 那样即使跑 JSON 后端也会加载 sqlite（只是空转，但日志里平白多一条实验特性告警，
// 模块顶栏代码也会被执行）。改成首次真正开库时才 require，模块边界与后端选择严格一致。
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');
const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
export const databaseFile=()=>path.join(dataDir(),'atom.db');

let DatabaseSync=null,db=null;
function loadSqlite(){return DatabaseSync??=require('node:sqlite').DatabaseSync;}
export function getDb(){
 if(db)return db;
 fs.mkdirSync(path.dirname(databaseFile()),{recursive:true});
 db=new (loadSqlite())(databaseFile());
 db.exec('PRAGMA journal_mode=WAL;');
 db.exec(`
  CREATE TABLE IF NOT EXISTS users(
   id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, color TEXT, salt TEXT, pass_hash TEXT,
   external_id TEXT UNIQUE, model TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS sessions(
   token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
   created_at INTEGER, expires_at INTEGER);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS memories(
   id TEXT PRIMARY KEY, account_id TEXT NOT NULL, agent_id TEXT NOT NULL,
   text TEXT, source TEXT, kind TEXT, created_at INTEGER, expires_at INTEGER);
  CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(account_id, agent_id);
  CREATE TABLE IF NOT EXISTS follows(
   target_type TEXT NOT NULL, target_id TEXT NOT NULL, account_id TEXT NOT NULL,
   created_at INTEGER, PRIMARY KEY(target_type, target_id, account_id));
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value INTEGER);
  -- 管理域：单文档存储（发布覆盖层/门派库/门派同步缓存与覆盖层）--
  CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
  -- 审计：只追加不更新，按时间索引查询（取代按月的 JSON 分片）--
  CREATE TABLE IF NOT EXISTS audit_events(
   id TEXT PRIMARY KEY, time TEXT, actor TEXT, action TEXT, target_id TEXT, scope TEXT,
   before_json TEXT, after_json TEXT, note TEXT);
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(time);
  -- 模型预算账本：按请求去重、按天聚合--
  CREATE TABLE IF NOT EXISTS budget_requests(
   request_id TEXT PRIMARY KEY, status TEXT, model TEXT,
   tokens_in INTEGER, tokens_out INTEGER, cost REAL, time TEXT, settled_at TEXT);
  CREATE TABLE IF NOT EXISTS budget_days(day TEXT PRIMARY KEY, cost REAL, calls INTEGER);
  -- 嵌入向量缓存：按文本哈希寻址--
  CREATE TABLE IF NOT EXISTS embeddings(hash TEXT PRIMARY KEY, vector TEXT);
 `);
 return db;
}
// 事务：BEGIN IMMEDIATE 拿写锁，fn 里抛异常整体回滚。同步 API，调用形状与 JSON 后端一致。
export function tx(fn){
 const db=getDb();
 db.exec('BEGIN IMMEDIATE');
 try{const result=fn(db);db.exec('COMMIT');return result;}
 catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
