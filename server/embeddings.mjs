// 可配置嵌入向量召回：配置 ATOM_EMBEDDING_* 后，记忆与作品检索走语义向量（余弦）；
// 未配置或提供方不可用时返回 null，由调用方回退到二元组 TF-IDF（接口不变）。
// 嵌入结果按文本哈希缓存在 data/embedding-cache.json，内容变更只重算新增项。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const cacheFile=()=>path.join(process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data'),'embedding-cache.json');

let config=null;
export function configureEmbeddings(env={}){
 config={
  baseUrl:(env.ATOM_EMBEDDING_BASE_URL||'').replace(/\/$/,''),
  apiKey:env.ATOM_EMBEDDING_API_KEY||'',
  model:env.ATOM_EMBEDDING_MODEL||'text-embedding-3-small',
 };
 return embeddingsEnabled();
}
export function embeddingsEnabled(){return !!(config&&config.baseUrl&&config.apiKey);}

function readCache(){
 try{const cache=JSON.parse(fs.readFileSync(cacheFile(),'utf8'));if(cache&&typeof cache==='object')return cache;}catch{}
 return {};
}
function writeCache(cache){
 const file=cacheFile();
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(cache));
 fs.renameSync(tmp,file);
}
const hash=text=>crypto.createHash('sha1').update(String(text)).digest('hex');

export function cosine(a,b){
 if(!a||!b||a.length!==b.length)return 0;
 let dot=0,normA=0,normB=0;
 for(let i=0;i<a.length;i++){dot+=a[i]*b[i];normA+=a[i]*a[i];normB+=b[i]*b[i];}
 return dot&&normA&&normB?dot/Math.sqrt(normA*normB):0;
}
// 批量嵌入（带缓存）；未配置返回 null。fetchImpl 可注入用于测试。
export async function embedTexts(texts,{fetchImpl=fetch}={}){
 if(!embeddingsEnabled()||!Array.isArray(texts)||!texts.length)return null;
 const cache=readCache();
 const pending=[],keys=[];
 for(const text of texts){
  const key=hash(text);
  keys.push(key);
  if(!cache[key])pending.push(text);
 }
 if(pending.length){
  try{
   const response=await fetchImpl(config.baseUrl+'/embeddings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,input:pending}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)return null;
   const json=await response.json();
   const vectors=json.data||[];
   if(vectors.length!==pending.length)return null;
   vectors.forEach((item,i)=>{if(Array.isArray(item.embedding))cache[hash(pending[i])]=item.embedding;});
   writeCache(cache);
  }catch{return null;}
 }
 const result=keys.map(key=>cache[key]||null);
 return result.every(Boolean)?result:null;
}
// 用向量对条目排序（textOf 取条目文本）；未配置或失败返回 null。
export async function rankByEmbedding(query,items,textOf,{fetchImpl=fetch,limit=8}={}){
 const vectors=await embedTexts([query,...items.map(textOf)],{fetchImpl});
 if(!vectors)return null;
 const [queryVec,...itemVecs]=vectors;
 return items.map((item,i)=>({item,score:cosine(queryVec,itemVecs[i])}))
  .filter(x=>x.score>0.2)
  .sort((a,b)=>b.score-a.score)
  .slice(0,limit)
  .map(x=>x.item);
}
