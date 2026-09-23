// 私人记忆存储（本地演示的账号体系）：按 (userId, agentId) 隔离。
// 用户主动表达的兴趣才保存；删除后立即排除召回并递增版本号（在途结果按版本丢弃）；
// 支持过期时间；召回先限定作用域，再做相关性与新近度排序。
import fs from 'node:fs';
import path from 'node:path';
import {similarity,tfidfCosine,bigrams} from '../src/content/similarity.js';
import {rankByEmbedding} from './embeddings.mjs';

const root=path.resolve(import.meta.dirname,'..');
const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const storeFile=()=>path.join(dataDir(),'memories.json');
const MAX_PER_AGENT=60;
const DEFAULT_TTL_DAYS=90;

function readStore(){
 try{const store=JSON.parse(fs.readFileSync(storeFile(),'utf8'));if(store&&typeof store==='object')return {entries:Array.isArray(store.entries)?store.entries:[],version:Number(store.version)||0};}catch{}
 return {entries:[],version:0};
}
function writeStore(store){
 const file=storeFile();
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(store,null,2));
 fs.renameSync(tmp,file);
}
const alive=entry=>!entry.expiresAt||entry.expiresAt>Date.now();

export function listMemories(userId,agentId){
 const all=readStore().entries.filter(e=>e.userId===userId&&alive(e));
 const scoped=agentId?all.filter(e=>e.agentId===agentId):all;
 return scoped.sort((a,b)=>b.createdAt-a.createdAt);
}
export function saveMemory(userId,agentId,text,{source='你主动表达的兴趣',kind='interest',ttlDays=DEFAULT_TTL_DAYS}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('记忆内容不能为空');
 const store=readStore();
 const entry={id:`mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,userId,agentId,text:[...text].slice(0,300).join(''),source:String(source).slice(0,60),kind:String(kind).slice(0,20),createdAt:Date.now(),expiresAt:ttlDays>0?Date.now()+ttlDays*86400000:null};
 store.entries.push(entry);
 // 每个 (用户, 角色) 有界，超出淘汰最旧。
 const scoped=store.entries.filter(e=>e.userId===userId&&e.agentId===agentId);
 if(scoped.length>MAX_PER_AGENT){
  const drop=new Set(scoped.sort((a,b)=>a.createdAt-b.createdAt).slice(0,scoped.length-MAX_PER_AGENT).map(e=>e.id));
  store.entries=store.entries.filter(e=>!drop.has(e.id));
 }
 store.version++;
 writeStore(store);
 return entry;
}
export function deleteMemory(userId,id){
 const store=readStore();
 const target=store.entries.find(e=>e.id===id&&e.userId===userId);
 if(!target)return false;
 store.entries=store.entries.filter(e=>e.id!==id);
 store.version++;
 writeStore(store);
 return true;
}
export function deleteAllMemories(userId,agentId){
 const store=readStore();
 const before=store.entries.length;
 store.entries=store.entries.filter(e=>!(e.userId===userId&&(!agentId||e.agentId===agentId)));
 store.version++;
 writeStore(store);
 return before-store.entries.length;
}
export function storeVersion(){return readStore().version;}
// 召回：先限定作用域（绝不先全库召回再靠提示词约束）；有查询词时只返回相似度达标的条目，
// 按相似度为主、新近度为微调排序；无相关记录时返回空（不伪造经历）。
// 相似度用作用域内 IDF 加权：跨条目常见的普通词（喜欢、我在）自动降权。
export function recallMemories(userId,agentId,query='',limit=8){
 const scope=listMemories(userId,agentId);
 const needle=String(query||'').trim();
 if(!needle)return scope.slice(0,limit);
 const df=new Map();
 for(const entry of scope)for(const gram of new Set(bigrams(entry.text).keys()))df.set(gram,(df.get(gram)||0)+1);
 const total=scope.length||1;
 const idf=gram=>Math.log(1+total/(1+(df.get(gram)||0)));
 const now=Date.now();
 return scope.map(entry=>{
  const sim=tfidfCosine(needle,entry.text,idf);
  const ageDays=Math.max(0,(now-entry.createdAt)/86400000);
  return {entry,sim,score:sim+(1/(1+ageDays/30))*.05};
 }).filter(x=>x.sim>.18)
  .sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.entry);
}
// 迁移：把本机旧记忆写入账号（用户选择后调用），返回迁移条数。
export function importMemories(userId,items){
 if(!Array.isArray(items)||!items.length)return 0;
 let count=0;
 for(const item of items){
  if(!item||typeof item.text!=='string'||!item.text.trim()||typeof item.agentId!=='string')continue;
  try{saveMemory(userId,item.agentId,[...item.text].slice(0,300).join(''),{source:String(item.source||'从本机迁移').slice(0,60),kind:String(item.kind||'interest').slice(0,20)});count++;}catch{}
 }
 return count;
}

// 异步召回：配置嵌入提供方时走向量余弦（作用域限定不变），否则回退上面的 TF-IDF。
export async function recallMemoriesAsync(userId,agentId,query='',limit=8){
 const scope=listMemories(userId,agentId);
 const needle=String(query||'').trim();
 if(!needle)return scope.slice(0,limit);
 const ranked=await rankByEmbedding(needle,scope,e=>e.text,{limit});
 return ranked||recallMemories(userId,agentId,query,limit);
}
