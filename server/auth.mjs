// 鉴权接口：注册、登录、登出、当前名帖、更新名帖。
// 本地演示的账号体系；会话令牌同时用于联机世界的 hello 校验。
import {register,login,logout,verify,updateProfile,findOrCreateExternal,issueSession} from './accounts.mjs';
import {verifyExternalToken,externalAuthConfig,externalAuthReady} from './external-auth.mjs';

const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};

export function authPlugin(env=process.env){
 const plugin={name:'atom-auth',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/auth'))return next();
   if(req.method!=='POST'&&url.pathname!=='/api/auth/me'&&url.pathname!=='/api/auth/config')return send(res,405,{error:'接口仅支持 POST'});
   const readBody=async()=>{let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>4000)return null;body+=chunk;}try{return JSON.parse(body||'{}');}catch{return null;}};
   try{
    if(url.pathname==='/api/auth/register'&&req.method==='POST'){
     const data=await readBody();
     if(!data)return send(res,400,{error:'请求格式不正确'});
     const user=register(data.name,data.password,data.color);
     const session=login(user.name,data.password);
     return send(res,200,{token:session.token,user});
    }
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){
     const data=await readBody();
     if(!data)return send(res,400,{error:'请求格式不正确'});
     const session=login(data.name,data.password);
     return send(res,200,{token:session.token,user:session.user});
    }
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){
     const data=await readBody();
     logout(data?.token);
     return send(res,200,{ok:true});
    }
    if(url.pathname==='/api/auth/config'&&req.method==='GET'){
     const config=externalAuthConfig(env);
     return send(res,200,{mode:config.mode,ready:externalAuthReady(env)});
    }
    if(url.pathname==='/api/auth/external'&&req.method==='POST'){
     const data=await readBody();
     if(!data||typeof data.token!=='string')return send(res,400,{error:'缺少社区账号令牌'});
     const identity=await verifyExternalToken(data.token,env);
     if(!identity)return send(res,401,{error:'社区账号验证失败'});
     const user=findOrCreateExternal(identity.subject,identity.name);
     const token=issueSession(user.id);
     return send(res,200,{token,user});
    }
    if(url.pathname==='/api/auth/me'&&req.method==='GET'){
     const token=url.searchParams.get('token')||'';
     const session=verify(token);
     if(!session)return send(res,401,{error:'登录状态已失效'});
     return send(res,200,{user:session.user});
    }
    if(url.pathname==='/api/auth/profile'&&req.method==='POST'){
     const data=await readBody();
     if(!data||typeof data.token!=='string')return send(res,400,{error:'请求格式不正确'});
     const user=updateProfile(data.token,{name:data.name,color:data.color});
     return send(res,200,{user});
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
