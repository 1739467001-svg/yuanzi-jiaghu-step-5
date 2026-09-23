import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 嵌入缓存写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-embed-'));
process.env.ATOM_DATA_DIR=tmp;
const embeddings = await import('../server/embeddings.mjs');
const {configureEmbeddings,embeddingsEnabled,embedTexts,rankByEmbedding,cosine} = embeddings;

// mock 提供方：把文本映射到概念向量（同义词归并到同一维度），
// 以此验证"改写说法也能召回"的语义路径——二元组匹配做不到这一点。
const CONCEPTS={
 选品:['选品','商品筛选','筛选商品','跨境选品'],
 视频:['视频','短片','影片'],
 写作:['写作','写文章','文案'],
 投资:['投资','理财','量化'],
};
const vecFor=text=>Object.values(CONCEPTS).map(syns=>syns.some(s=>text.includes(s))?1:0);
const mockFetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 return {ok:true,json:async()=>({data:body.input.map(text=>({embedding:vecFor(text)}))})};
};
const failingFetch=async()=>{throw new Error('provider down');};

test('without configuration the vector path yields to the TF-IDF fallback', async () => {
 configureEmbeddings({});
 assert.equal(embeddingsEnabled(),false);
 assert.equal(await embedTexts(['任何文本'],{fetchImpl:mockFetch}),null,'未配置不调用提供方');
 assert.equal(await rankByEmbedding('查询',['条目'],x=>x,{fetchImpl:mockFetch}),null);
});

test('configured provider embeds, caches to disk, and ranks paraphrases first', async () => {
 configureEmbeddings({ATOM_EMBEDDING_BASE_URL:'http://mock.local/v1',ATOM_EMBEDDING_API_KEY:'k',ATOM_EMBEDDING_MODEL:'m'});
 assert.equal(embeddingsEnabled(),true);
 // 改写说法：查询用"商品筛选"，记忆用"选品"——无语义重叠但有概念重叠。
 const memories=['我在研究金融投资的量化策略','我在做跨境电商选品，想找提效工具','平时喜欢写作，写文章和文案'];
 const ranked=await rankByEmbedding('想找商品筛选的工具',memories,t=>t,{fetchImpl:mockFetch,limit:3});
 assert.ok(ranked,'配置后返回向量排序');
 assert.match(ranked[0],/选品/,'改写说法排第一');
 // 无关概念不应通过阈值。
 const unrelated=await rankByEmbedding('怎么养猫',memories,t=>t,{fetchImpl:mockFetch,limit:3});
 assert.equal(unrelated.length,0,'无关查询不返回');
 // 缓存落盘：第二次调用不触网（fetchImpl 计数为 0 次仍能返回）。
 let calls=0;
 const countingFetch=async(...args)=>{calls++;return mockFetch(...args);};
 await embedTexts(memories,{fetchImpl:countingFetch});
 assert.equal(calls,0,'全部命中缓存，不再调用提供方');
 const cache=JSON.parse(fs.readFileSync(path.join(tmp,'embedding-cache.json'),'utf8'));
 const crypto=await import('node:crypto');
 for(const text of memories){
  const key=crypto.createHash('sha1').update(text).digest('hex');
  assert.ok(cache[key],`缓存包含：${text.slice(0,10)}…`);
 }
});

test('provider failure falls back instead of breaking recall', async () => {
 configureEmbeddings({ATOM_EMBEDDING_BASE_URL:'http://down.local/v1',ATOM_EMBEDDING_API_KEY:'k'});
 const result=await rankByEmbedding('选品工具',['我在做跨境电商选品'],t=>t,{fetchImpl:failingFetch});
 assert.equal(result,null,'提供方故障返回 null，由调用方回退');
});

test('cosine behaves as expected on plain vectors', () => {
 assert.equal(cosine([1,0],[1,0]),1);
 assert.equal(cosine([1,0],[0,1]),0);
 assert.ok(cosine([1,1],[1,0])>0.7);
 assert.equal(cosine([1,2],[1,2,3]),0,'维度不同返回 0');
});
