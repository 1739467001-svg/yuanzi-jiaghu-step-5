// 存储后端调度：ATOM_STORE=sqlite 时账号/会话/记忆/关注走 SQLite（server/store-sqlite.mjs），
// 默认（未设置或其他值）走 JSON 文件（accounts.mjs / memories.mjs / follows.mjs）。
// 上层（auth/chat/memory-api/sects-api/world/follows-api）只依赖这里导出的函数签名，不关心后端；
// 两个后端的行为差异只有 docs/STORAGE.md 列出的那几条（事务、索引、懒清理）。
const backend=String(process.env.ATOM_STORE||'json').trim().toLowerCase();
export const usingSqlite=backend==='sqlite';

const accounts=usingSqlite?await import('./store-sqlite.mjs'):await import('./accounts.mjs');
const memories=usingSqlite?await import('./store-sqlite.mjs'):await import('./memories.mjs');
const follows=usingSqlite?await import('./store-sqlite.mjs'):await import('./follows.mjs');

export const {register,login,logout,verify,updateProfile,findOrCreateExternal,issueSession,publicUser}=accounts;
export const {listMemories,saveMemory,deleteMemory,deleteAllMemories,storeVersion,recallMemories,recallMemoriesAsync,importMemories}=memories;
export const {listFollows,isFollowing,addFollow,removeFollow}=follows;
// 一次性迁移（仅 SQLite 后端提供）：把 data/*.json 灌进库，见 scripts/migrate-json-to-sqlite.mjs。
export const migrateStore=usingSqlite?accounts.migrateFromJson:null;
