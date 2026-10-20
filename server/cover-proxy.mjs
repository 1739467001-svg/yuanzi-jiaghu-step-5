// 官网封面/Logo 的同源代理（3D 门派牌坊与内景挂封面用）。
// 为什么需要：原子公社的封面在阿里云 OSS 上，不回 CORS 头——浏览器带 crossOrigin 直接加载
// 远程图会被拒（牌坊封面全灭，只剩样式色本体）。同源代理把图抓过来再发给前端。
//
// 安全边界：只放行「当前远程快照里出现过的图片主机」与「数据源主机」——远程站点给什么图
// 就代理什么图，不是开放代理（防被当成 SSRF 跳板打内网）。内存缓存按 URL 寻址、有容量上限；
// 抓取失败由调用方回 404，前端撤掉封面布保持场景完整。
const MAX_BYTES=4*1024*1024;
const CACHE_TTL_MS=10*60*1000;
const CACHE_MAX=200;

function hostOf(value){
 try{return new URL(value).host;}catch{return '';}
}
// 已登记的白名单主机：各数据源（门派快照、商店快照……）在同步时把自家图片主机登记进来，
// 代理端点只服务这些主机 + 数据源主机——远程站点给什么图就代理什么，不是开放代理。
const allowedHosts=new Set();
export function allowImageHosts(hosts){
 for(const host of hosts||[])if(host)allowedHosts.add(host);
}
// 白名单：已登记主机 + 远程快照里各门派的 coverUrl/logo 主机 + 数据源主机。
export function coverHostAllowed(target,sects=[],sourceBase=''){
 if(typeof target!=='string'||!target)return false;
 let url;
 try{url=new URL(target);}catch{return false;}
 if(url.protocol!=='http:'&&url.protocol!=='https:')return false;
 const hosts=new Set(allowedHosts);
 const base=hostOf(sourceBase);
 if(base)hosts.add(base);
 for(const sect of sects||[]){
  for(const key of ['coverUrl','logo']){
   const host=hostOf(sect&&sect[key]);
   if(host)hosts.add(host);
  }
 }
 return hosts.has(url.host);
}

export function createCoverCache(){
 const cache=new Map();
 return {
  get(key){
   const hit=cache.get(key);
   if(!hit)return null;
   if(hit.expires<Date.now()){cache.delete(key);return null;}
   return hit;
  },
  set(key,value){
   if(cache.size>=CACHE_MAX&&!cache.has(key))cache.delete(cache.keys().next().value);
   cache.set(key,{...value,expires:Date.now()+CACHE_TTL_MS});
  },
  size:()=>cache.size,
 };
}

// 抓取并校验：只收图片、有体积上限；任何不合适都返回 null（调用方回 404）。
export async function fetchCover(target,{fetchImpl=fetch,timeoutMs=10000}={}){
 const response=await fetchImpl(target,{signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)return null;
 const contentType=response.headers.get('content-type')||'';
 if(!/^image\//.test(contentType))return null;
 const buffer=Buffer.from(await response.arrayBuffer());
 if(!buffer.length||buffer.length>MAX_BYTES)return null;
 return {buffer,contentType};
}
