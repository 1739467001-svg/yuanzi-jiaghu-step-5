import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {chatPlugin} from './server/chat.mjs';
import {contentPlugin} from './server/content.mjs';
import {authPlugin} from './server/auth.mjs';
import {memoryApiPlugin} from './server/memory-api.mjs';
import {createRoomHub,roomsApiPlugin} from './server/rooms.mjs';
import {configureEmbeddings} from './server/embeddings.mjs';
import {followsApiPlugin} from './server/follows.mjs';
import {isAdminRequest} from './server/publication-store.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 configureEmbeddings(env); // 嵌入检索：配置 ATOM_EMBEDDING_* 后启用，否则回退 TF-IDF
 const reclaimWindowMs=Math.max(200,Number(env.ATOM_RECLAIM_WINDOW_MS)||15000);
 const hub=createRoomHub({env,reclaimWindowMs});
 const allowedOrigins=String(env.ATOM_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const worldPlugin={name:'atom-world',configureServer:server=>{
  hub.attach(server.httpServer,'/ws/world',{allowedOrigins});
  let last=Date.now();
  // 用真实经过时间推进，避免事件循环拥塞时世界变慢导致客户端预测被反复纠正。
  const timer=setInterval(()=>{const now=Date.now();hub.tick(Math.min(.5,(now-last)/1000));last=now;},100);
  server.httpServer.on('close',()=>clearInterval(timer));
 },configurePreviewServer:server=>{
  hub.attach(server.httpServer,'/ws/world',{allowedOrigins});
  let last=Date.now();
  const timer=setInterval(()=>{const now=Date.now();hub.tick(Math.min(.5,(now-last)/1000));last=now;},100);
  server.httpServer.on('close',()=>clearInterval(timer));
 }};
 return {base:process.env.VITE_BASE_PATH||'/',plugins:[react(),contentPlugin(env),authPlugin(env),memoryApiPlugin(),followsApiPlugin(),roomsApiPlugin(hub,{env,isAdminRequest}),chatPlugin(env),worldPlugin],optimizeDeps:{entries:['index.html','admin.html']},server:{port:5173,strictPort:true,host:'127.0.0.1'},build:{rollupOptions:{input:{main:root+'index.html',admin:root+'admin.html'},output:{manualChunks:{three:['three'],react:['react','react-dom']}}}}}});
