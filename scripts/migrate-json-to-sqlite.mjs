#!/usr/bin/env node
// 一次性迁移：把 JSON 后端的数据灌进 SQLite（ATOM_STORE=sqlite 启用后的第一步）。
//
// 用法（在服务端停止时执行，避免迁移与服务端同时写）：
//   node scripts/migrate-json-to-sqlite.mjs        # 或 npm run migrate:sqlite
//
// 迁移范围：accounts.json（账号/会话）、memories.json（私人记忆）、follows.json（关注）。
// 发布覆盖层、审计日志、预算账本、门派库仍是 JSON——它们的写入频率低，迁移路径见 docs/STORAGE.md。
// 幂等：重复执行不会产生重复数据（users/sessions/memories 用 INSERT OR REPLACE，follows 用 OR IGNORE）。
// JSON 原文件不删除；确认 SQLite 端无误后再用 ATOM_STORE=sqlite 启动服务。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const {migrateFromJson,databaseFile}=await import('../server/store-sqlite.mjs');

const jsonFiles=['accounts.json','memories.json','follows.json'].map(f=>path.join(dataDir,f));
const present=jsonFiles.filter(f=>fs.existsSync(f));
if(!present.length){
 console.error(`在 ${dataDir} 下没有找到可迁移的 JSON 数据（accounts.json / memories.json / follows.json）。`);
 console.error('如果这是首次部署（还没有 JSON 数据），无需迁移——直接用 ATOM_STORE=sqlite 启动即可。');
 process.exit(1);
}
const result=migrateFromJson({dataDir});
console.log(`迁移完成 → ${databaseFile()}`);
console.log(`账号 ${result.users} · 会话 ${result.sessions} · 记忆 ${result.memories} · 关注 ${result.follows} · 记忆版本号 ${result.memoryVersion}`);
console.log('JSON 原文件保留未删；确认无误后用 ATOM_STORE=sqlite 启动服务（见 docs/STORAGE.md）。');
