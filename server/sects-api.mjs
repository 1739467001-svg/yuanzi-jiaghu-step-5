// 门派 API 插件：/api/sects 系列。与内容服务同模式挂载（vite dev/preview 与生产服务）。
// GET  /api/sects?page=&size=      分页（默认每页 4）
// GET  /api/sects/:id              门派详情（含三角色）
// POST /api/sects                  {name,slogan,intro,style} 建派（需会话令牌）
// PATCH /api/sects/:id             {name,slogan,intro,style} 改资料（仅创始人）
// POST /api/sects/:id/elders       {name,title} 加入长老阁（仅创始人）
// POST /api/sects/:id/disciples    {name,title} 收入弟子（仅创始人）
// POST /api/sects/:id/members/remove {userId} 移出成员（仅创始人）
import {createSect,updateSect,updateLayout,addElder,addDisciple,removeMember,applyToSect,listApplications,decideApplication,setJoinPolicy,addNotice,removeNotice,findSect,pageSects,SECT_PAGE_SIZE,ELDER_TITLES,DISCIPLE_TITLES,sectSourceStatus,sectSource,refreshSectSource} from './sects.mjs';
import {verify} from './accounts.mjs';
const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const readBody=async(req,limit=8000)=>{let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new Error('请求过大');body+=chunk;}return JSON.parse(body||'{}');};
function sessionOf(req){
 const token=String(req.headers['x-atom-token']||'');
 if(!token)return null;
 try{const s=verify(token);return s?{id:s.user.id,name:s.user.name}:null;}catch{return null;}
}
export function sectsApiPlugin(){
 const plugin={name:'atom-sects-api',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/sects'))return next();
   try{
    if(url.pathname==='/api/sects'&&req.method==='GET'){
     // 分页响应带上数据来源：接原子公社门派网站时，前端/运维能看出是不是远程数据。
     return send(res,200,{...pageSects(url.searchParams.get('page')||1,url.searchParams.get('size')||SECT_PAGE_SIZE),source:sectSourceStatus()});
    }
    if(url.pathname==='/api/sects/status'&&req.method==='GET')return send(res,200,sectSourceStatus());
    const idMatch=/^\/api\/sects\/([^/]+)$/.exec(url.pathname);
    if(idMatch&&req.method==='GET'){const sect=findSect(decodeURIComponent(idMatch[1]));return sect?send(res,200,sect):send(res,404,{error:'门派不存在'});}
    // 入派申请列表用 GET（其余写操作仍是 POST/PATCH）。
    const appsGet=/^\/api\/sects\/[^/]+\/applications$/.test(url.pathname)&&req.method==='GET';
    if(req.method!=='POST'&&req.method!=='PATCH'&&!appsGet)return send(res,405,{error:'方法不支持'});
    const user=sessionOf(req);
    if(!user)return send(res,401,{error:'请先登录（或创建本地演示身份）'});
    // 手动触发一次远程同步（仅登录用户；同步本身是只读的远程拉取）。
    if(url.pathname==='/api/sects/refresh'&&req.method==='POST')return send(res,200,{source:await refreshSectSource()});
    // 成员管理、小镇布局、入派申请、公告都是「:id/子路径」，必须和 :id 分开匹配（否则整条落到 404）。
    const sub=/^\/api\/sects\/([^/]+)\/(elders|disciples|members\/remove|layout|apply|applications|applications\/[^/]+|notices|notices\/[^/]+|join-policy)$/.exec(url.pathname);
    if(sub){
     const id=decodeURIComponent(sub[1]),body=await readBody(req),leaf=sub[2];
     if(leaf==='elders')return send(res,200,addElder(id,body,user));
     if(leaf==='disciples')return send(res,200,addDisciple(id,body,user));
     if(leaf==='layout')return send(res,200,updateLayout(id,body,user));
     if(leaf==='apply')return send(res,200,applyToSect(id,body,user));
     if(leaf==='join-policy')return send(res,200,setJoinPolicy(id,String(body.policy||''),user));
     if(leaf==='applications')return send(res,200,listApplications(id,user));
     if(leaf.startsWith('applications/'))return send(res,200,decideApplication(id,leaf.slice('applications/'.length),String(body.decision||''),user));
     if(leaf==='notices')return send(res,200,addNotice(id,body,user));
     return send(res,200,removeNotice(id,leaf.slice('notices/'.length),user));
    }
    if(url.pathname==='/api/sects'&&req.method==='POST')return send(res,200,createSect(await readBody(req),user));
    if(idMatch&&req.method==='PATCH')return send(res,200,updateSect(decodeURIComponent(idMatch[1]),await readBody(req),user));
    return send(res,404,{error:'接口不存在'});
   }catch(error){return send(res,400,{error:error.message||'操作失败'});}
  });
 }};
 // dev 与 preview 都要挂载（与 content/auth/chat 插件同模式）。
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
export {ELDER_TITLES,DISCIPLE_TITLES} from './sects.mjs';
