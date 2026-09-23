// 生产服务入口：一个 Node 进程提供完整联机体验。
//   node server/index.mjs            （先 npm run build 生成 dist/）
// 静态托管 dist/，挂载内容/鉴权/记忆/聊天 API 与权威世界 WebSocket。
// 环境变量见 docs/DEPLOY.md；数据默认写在 ./data（ATOM_DATA_DIR 可改）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contentPlugin} from './content.mjs';
import {authPlugin} from './auth.mjs';
import {memoryApiPlugin} from './memory-api.mjs';
import {chatPlugin} from './chat.mjs';
import {createRoomHub,roomsApiPlugin} from './rooms.mjs';
import {originAllowed} from './world.mjs';
import {configureEmbeddings,embeddingsEnabled} from './embeddings.mjs';
import {followsApiPlugin} from './follows.mjs';
import {isAdminRequest} from './publication-store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const distDir=path.join(root,'dist');
const PORT=Number(process.env.PORT)||8080;
const HOST=process.env.HOST||'0.0.0.0';
const allowedOrigins=String(process.env.ATOM_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.map':'application/json'};
const sendFile=(res,file,{cache='public, max-age=3600'}={})=>{
 const ext=path.extname(file).toLowerCase();
 res.setHeader('Content-Type',MIME[ext]||'application/octet-stream');
 res.setHeader('Cache-Control',cache);
 fs.createReadStream(file).pipe(res);
};
const serveStatic=(req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.statusCode=400;return res.end('Bad Request');}
 if(pathname.endsWith('/'))pathname+='index.html';
 const file=path.join(distDir,pathname);
 // 防目录穿越：解析后必须仍在 dist 内。
 if(!file.startsWith(distDir)){res.statusCode=403;return res.end('Forbidden');}
 fs.stat(file,(err,stat)=>{
  if(!err&&stat.isFile()){
   const hashed=/\/assets\/[^/]+-[^/]+\.(js|css)$/.test(pathname);
   return sendFile(res,file,{cache:hashed?'public, max-age=31536000, immutable':'public, max-age=3600'});
  }
  // HTML 与其入口不缓存；其余缺失路径回退 index.html（SPA）。
  const isAsset=/\.(js|mjs|css|png|jpe?g|webp|svg|glb|woff2|ico|map)$/i.test(pathname);
  if(isAsset){res.statusCode=404;return res.end('Not Found');}
  const index=path.join(distDir,'index.html');
  if(fs.existsSync(index))return sendFile(res,index,{cache:'no-cache'});
  res.statusCode=503;res.end('尚未构建：请先运行 npm run build');
 });
};

configureEmbeddings(process.env); // 嵌入检索：配置 ATOM_EMBEDDING_* 后启用，否则回退 TF-IDF
const middlewares=[];
const shim={httpServer:null,middlewares:{use:fn=>middlewares.push(fn)}};
const reclaimWindowMs=Math.max(200,Number(process.env.ATOM_RECLAIM_WINDOW_MS)||15000);
const hub=createRoomHub({env:process.env,reclaimWindowMs});
contentPlugin(process.env).configureServer(shim);
authPlugin().configureServer(shim);
memoryApiPlugin().configureServer(shim);
followsApiPlugin().configureServer(shim);
roomsApiPlugin(hub,{env:process.env,isAdminRequest}).configureServer(shim);
chatPlugin(process.env).configureServer(shim);

// 跨域（前端分离部署到 Vercel 等静态托管时）：Origin 在白名单内才发放 CORS 头，
// 预检请求直接通过；同源部署不受影响（浏览器不发 Origin 或同源直接放行）。
middlewares.unshift((req,res,next)=>{
 const origin=req.headers.origin;
 if(origin&&originAllowed(req,allowedOrigins)){
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,x-atom-admin');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 }
 next();
});

const server=http.createServer((req,res)=>{
 let index=0;
 const next=()=>{
  const handler=middlewares[index++];
  if(!handler)return serveStatic(req,res);
  try{return handler(req,res,next);}catch(error){res.statusCode=500;res.end('Internal Server Error');}
 };
 next();
});
shim.httpServer=server;

// 房间枢纽：每个房间独立权威世界；同源或白名单来源才能升级（防 CSWSH）。
hub.attach(server,'/ws/world',{allowedOrigins});
let last=Date.now();
const tick=setInterval(()=>{const now=Date.now();hub.tick(Math.min(.5,(now-last)/1000));last=now;},100);

server.listen(PORT,HOST,()=>{
 console.log(`原子江湖已启动: http://${HOST}:${PORT}`);
 if(embeddingsEnabled())console.log('嵌入: 已配置（记忆与作品检索使用向量余弦）');
console.log(`世界: /ws/world?room=<id> · 房间 ${hub.list().map(r=>`${r.id}(${r.capacity})`).join('、')} · 数据目录 ${process.env.ATOM_DATA_DIR||path.join(root,'data')}`);
 if(!process.env.ATOM_LLM_API_KEY)console.log('模型: 未配置（AI 私聊使用本地资料演示；配置 ATOM_LLM_API_KEY 后启用）');
});
const shutdown=()=>{clearInterval(tick);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
