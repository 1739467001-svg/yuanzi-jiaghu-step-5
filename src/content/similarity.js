// 轻量词形相似度：字符二元组（bigram）TF 余弦。中文无需分词，中英混排亦可。
// 作为本地演示的召回与检索排序；接入嵌入模型后替换本模块即可，调用方接口不变。
const bigramCache=new Map();
export function bigrams(text){
 const key=String(text||'');
 if(bigramCache.has(key))return bigramCache.get(key);
 // 归一化：小写、去标点与空白，保留文字字符。
 const normalized=key.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
 const counts=new Map();
 for(let i=0;i<normalized.length-1;i++){
  const gram=normalized.slice(i,i+2);
  counts.set(gram,(counts.get(gram)||0)+1);
 }
 if(bigramCache.size>2000)bigramCache.clear();
 bigramCache.set(key,counts);
 return counts;
}
export function cosineSim(a,b){
 const left=bigrams(a),right=bigrams(b);
 if(!left.size||!right.size)return 0;
 let dot=0;
 for(const [gram,count] of left){const other=right.get(gram);if(other)dot+=count*other;}
 if(!dot)return 0;
 let normA=0,normB=0;
 for(const count of left.values())normA+=count*count;
 for(const count of right.values())normB+=count*count;
 return dot/Math.sqrt(normA*normB);
}
export function similarity(query,text){return cosineSim(query,text);}
// TF-IDF 余弦：idf 由调用方按作用域计算（如记忆集合内某二元组出现在多少条里），
// 用来给"喜欢/我在"这类跨条目的普通词降权，提高召回精确度。
export function tfidfCosine(a,b,idf=()=>1){
 const left=bigrams(a),right=bigrams(b);
 if(!left.size||!right.size)return 0;
 let dot=0,normA=0,normB=0;
 for(const [gram,count] of left){
  const weight=idf(gram);
  normA+=count*count*weight*weight;
  const other=right.get(gram);
  if(other)dot+=count*other*weight*weight;
 }
 for(const [gram,count] of right){
  const weight=idf(gram);
  normB+=count*count*weight*weight;
 }
 return dot&&normA&&normB?dot/Math.sqrt(normA*normB):0;
}
