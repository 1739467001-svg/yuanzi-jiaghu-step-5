// 关注接口（PRD U01 / 9.4）：/api/follows 列表 / 关注 / 取消关注，会话令牌归属。
// 存储函数经 server/store.mjs 调度（JSON 或 SQLite 后端），鉴权与业务口径不变。
import {verify,listFollows,addFollow,removeFollow} from './store.mjs';

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
