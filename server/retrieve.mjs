// 服务端检索：配置嵌入提供方时走向量余弦，否则回退 src/demo.mjs 的同步 TF-IDF。
// 浏览器内的静态演示继续使用同步 retrieve（不向客户端暴露密钥）。
import {retrieve} from '../src/demo.mjs';
import {rankByEmbedding} from './embeddings.mjs';

export async function retrieveAsync(query,works,{fetchImpl=fetch,limit=3}={}){
 if(!Array.isArray(works)||!works.length)return [];
 const ranked=await rankByEmbedding(query,works,w=>[w.title,w.tagline||'',w.track,...(w.tags||[])].join(' '),{fetchImpl,limit});
 return ranked||retrieve(query,works);
}
