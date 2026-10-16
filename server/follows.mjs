// 关注关系（PRD U01 / 9.4）：单向关注，真人与 AI 熟悉度分开存储，按账号隔离。
// 存储 data/follows.json（JSON 后端）；SQLite 后端见 server/store-sqlite.mjs。
// 接口插件在同目录的 follows-api.mjs（与 memories.mjs / memory-api.mjs 的分工一致）。
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const storeFile=()=>path.join(process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data'),'follows.json');

function readStore(){
 try{const store=JSON.parse(fs.readFileSync(storeFile(),'utf8'));if(store&&typeof store==='object')return {items:Array.isArray(store.items)?store.items:[]};}catch{}
 return {items:[]};
}
function writeStore(store){
 const file=storeFile();
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(store,null,2));
 fs.renameSync(tmp,file);
}
// targetType: 'player'（联机真人）或 'ai'（AI 侠客）；两者分开存储。
export function listFollows(userId,targetType){
 return readStore().items.filter(f=>f.userId===userId&&(!targetType||f.targetType===targetType)).sort((a,b)=>b.createdAt-a.createdAt);
}
export function isFollowing(userId,targetType,targetId){
 return readStore().items.some(f=>f.userId===userId&&f.targetType===targetType&&f.targetId===targetId);
}
export function addFollow(userId,targetType,targetId){
 if(!['player','ai'].includes(targetType))throw new Error('关注类型不正确');
 if(typeof targetId!=='string'||!targetId)throw new Error('缺少关注对象');
 const store=readStore();
 if(store.items.some(f=>f.userId===userId&&f.targetType===targetType&&f.targetId===targetId))return {ok:true,duplicate:true};
 store.items.push({userId,targetType,targetId,createdAt:Date.now()});
 writeStore(store);
 return {ok:true,duplicate:false};
}
export function removeFollow(userId,targetType,targetId){
 const store=readStore();
 const before=store.items.length;
 store.items=store.items.filter(f=>!(f.userId===userId&&f.targetType===targetType&&f.targetId===targetId));
 writeStore(store);
 return {ok:true,removed:before-store.items.length>0};
}
