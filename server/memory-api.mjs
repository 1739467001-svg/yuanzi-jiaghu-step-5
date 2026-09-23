// 私人记忆接口：列表 / 保存 / 删除单条 / 全部删除 / 本机旧记忆迁移。
// 全部按会话令牌归属到账号；跨账号访问一律拒绝。
import {verify} from './accounts.mjs';
import {listMemories,saveMemory,deleteMemory,deleteAllMemories,importMemories,recallMemories,storeVersion} from './memories.mjs';

const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};

export function memoryApiPlugin(){
 const plugin={name:'atom-memories',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/memories'))return next();
   const readBody=async()=>{let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>16000)return null;body+=chunk;}try{return JSON.parse(body||'{}');}catch{return null;}};
   try{
    if(url.pathname==='/api/memories'&&req.method==='GET'){
     const session=verify(url.searchParams.get('token')||'');
     if(!session)return send(res,401,{error:'登录状态已失效'});
     const agentId=url.searchParams.get('agentId')||'';
     return send(res,200,{items:listMemories(session.userId,agentId),version:storeVersion()});
    }
    if(req.method!=='POST')return send(res,405,{error:'接口仅支持 POST'});
    const data=await readBody();
    if(!data||typeof data.token!=='string')return send(res,400,{error:'请求格式不正确'});
    const session=verify(data.token);
    if(!session)return send(res,401,{error:'登录状态已失效'});
    if(url.pathname==='/api/memories'){
     if(typeof data.agentId!=='string'||!data.agentId)return send(res,400,{error:'缺少角色'});
     const entry=saveMemory(session.userId,data.agentId,data.text,{source:data.source,kind:data.kind,ttlDays:data.ttlDays});
     return send(res,200,{entry,version:storeVersion()});
    }
    if(url.pathname==='/api/memories/delete'){
     if(!deleteMemory(session.userId,String(data.id)))return send(res,404,{error:'记忆不存在'});
     return send(res,200,{ok:true,version:storeVersion()});
    }
    if(url.pathname==='/api/memories/clear'){
     const removed=deleteAllMemories(session.userId,String(data.agentId||''));
     return send(res,200,{removed,version:storeVersion()});
    }
    if(url.pathname==='/api/memories/import'){
     const count=importMemories(session.userId,data.items);
     return send(res,200,{imported:count,version:storeVersion()});
    }
    if(url.pathname==='/api/memories/recall'){
     const items=recallMemories(session.userId,String(data.agentId||''),String(data.query||''),Number(data.limit)||8);
     return send(res,200,{items,version:storeVersion()});
    }
    return send(res,404,{error:'接口不存在'});
   }catch(error){
    return send(res,400,{error:error.message||'操作失败'});
   }
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
