// 关注关系（PRD U01 / 9.4）：单向关注，真人与 AI 熟悉度分开存储，按账号隔离。
// 存储 data/follows.json；接口 /api/follows（列表 / 关注 / 取消关注）。
import fs from 'node:fs';
import path from 'node:path';
import {verify} from './accounts.mjs';

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
export function followsApiPlugin(){
 const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 const readBody=async(req)=>{let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>4000)return null;body+=chunk;}try{return JSON.parse(body||'{}');}catch{return null;}};
 const plugin={name:'atom-follows',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/follows'))return next();
   if(url.pathname==='/api/follows'&&req.method==='GET'){
    const session=verify(url.searchParams.get('token')||'');
    if(!session)return send(res,401,{error:'登录状态已失效'});
    return send(res,200,{items:listFollows(session.userId)});
   }
   if(req.method!=='POST')return send(res,405,{error:'接口仅支持 POST'});
   const data=await readBody(req);
   if(!data||typeof data.token!=='string')return send(res,400,{error:'请求格式不正确'});
   const session=verify(data.token);
   if(!session)return send(res,401,{error:'登录状态已失效'});
   try{
    if(url.pathname==='/api/follows')return send(res,200,addFollow(session.userId,String(data.targetType),String(data.targetId)));
    if(url.pathname==='/api/follows/remove')return send(res,200,removeFollow(session.userId,String(data.targetType),String(data.targetId)));
   }catch(error){return send(res,400,{error:error.message||'操作失败'});}
   return send(res,404,{error:'接口不存在'});
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
