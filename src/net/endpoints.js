// 云端部署的端点配置。
// 默认同源：单进程部署（服务器同时提供静态文件、API 与 WS）时无需任何配置。
// 分离部署（前端在 Vercel 等静态托管、世界服务端在容器/云主机）时，用构建期环境变量指向服务端：
//   VITE_API_BASE=https://world.example.com      # 世界服务端的 HTTP 根，/api/* 与 /admin.html 都走它
//   VITE_WS_URL=wss://world.example.com/ws/world # 世界服务端的 WS 根
// 注意：前端若是 https，服务端必须提供 TLS（否则浏览器拦截 ws:// 混合内容）。
// import.meta.env 仅 Vite 构建时存在；Node 单测直接加载本模块时为空，退回同源默认值。
const env=import.meta.env||{};
const apiBase=String(env.VITE_API_BASE||'').replace(/\/+$/,'');
const wsBase=String(env.VITE_WS_URL||'').replace(/\/+$/,'');
export const apiUrl=path=>apiBase+path;
export const worldWsUrl=()=>{
 if(wsBase)return wsBase;
 const proto=window.location.protocol==='https:'?'wss':'ws';
 return `${proto}://${window.location.host}/ws/world`;
};
// 是否为分离部署（用于提示与运维判断）。
export const isSplitDeploy=()=>!!(apiBase||wsBase);
// 跑在 Vercel 等静态托管上、却没配置世界服务端地址：联机世界必然不可用，需明确告知。
export const missingWorldServer=()=>{
 if(apiBase||wsBase)return null;
 if(!env.VITE_VERCEL_ENV)return null;
 return '当前站点未配置世界服务端（VITE_API_BASE / VITE_WS_URL），联机世界不可用；请在 Vercel 项目设置环境变量后重新部署。';
};
