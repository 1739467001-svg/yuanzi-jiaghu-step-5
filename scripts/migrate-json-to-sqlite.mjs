#!/usr/bin/env node
// 一次性迁移：把 JSON 后端的数据灌进 SQLite（ATOM_STORE=sqlite 启用后的第一步）。
//
// 用法（在服务端停止时执行，避免迁移与服务端同时写）：
//   node scripts/migrate-json-to-sqlite.mjs        # 或 npm run migrate:sqlite
//
// 迁移范围：accounts.json（账号/会话）、memories.json（私人记忆）、follows.json（关注）、
// publication-overrides.json（发布状态）、audit-log*.json（审计，含旧单文件）、
// usage-ledger.json（预算账本）、sects.json / sects-overlay.json / sects-cache.json（门派）、
// embedding-cache.json（嵌入缓存）。幂等可重跑；建议在服务端停止时执行。
// JSON 原文件不删除；确认无误后用 ATOM_STORE=sqlite 启动服务。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const {migrateFromJson,databaseFile}=await import('../server/store-sqlite.mjs');
const {migratePubFromJson}=await import('../server/store-sqlite-pub.mjs');

const jsonFiles=['accounts.json','memories.json','follows.json','publication-overrides.json','audit-log.json','audit-log-2026-01.json','usage-ledger.json','sects.json','sects-overlay.json','sects-cache.json','embedding-cache.json'];
const present=jsonFiles.filter(f=>fs.existsSync(path.join(dataDir,f)));
const anyAuditShard=(()=>{try{return fs.readdirSync(dataDir).some(f=>/^audit-log.*\.json$/.test(f));}catch{return false;}})();
if(!present.length&&!anyAuditShard){
 console.error(`在 ${dataDir} 下没有找到可迁移的 JSON 数据。`);
 console.error('如果这是首次部署（还没有 JSON 数据），无需迁移——直接用 ATOM_STORE=sqlite 启动即可。');
 process.exit(1);
}
const core=migrateFromJson({dataDir});
const admin=migratePubFromJson({dataDir});
console.log(`迁移完成 → ${databaseFile()}`);
console.log(`账号 ${core.users} · 会话 ${core.sessions} · 记忆 ${core.memories} · 关注 ${core.follows} · 记忆版本号 ${core.memoryVersion}`);
console.log(`发布覆盖层 ${admin.overrides?'已迁移':'无'} · 审计 ${admin.audit} 条 · 预算请求 ${admin.budgetRequests} 条/按天 ${admin.budgetDays} 天`);
console.log(`门派库 ${admin.sects?'已迁移':'无'} · 覆盖层 ${admin.sectsOverlay?'已迁移':'无'} · 同步缓存 ${admin.sectsCache?'已迁移':'无'} · 嵌入缓存 ${admin.embeddings} 条`);
console.log('JSON 原文件保留未删；确认无误后用 ATOM_STORE=sqlite 启动服务（见 docs/STORAGE.md）。');
