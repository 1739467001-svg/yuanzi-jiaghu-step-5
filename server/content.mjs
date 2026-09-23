// 只读内容服务 + 运营管理接口。赛事目录与作品数据统一来自发布状态存储的实时目录
// （editions.json 基线 + 运营覆盖层），3D 展厅、阅读目录与 AI 导览读取同一份发布数据。
// GET  /api/content/health            服务与快照状态（含 stateVersion）
// GET  /api/content/catalog           完整已发布目录（前端统一入口）
// GET  /api/exhibitions               赛事目录摘要（兼容旧命名，实际承载赛事目录）
// GET  /api/exhibitions/{editionId}   一届赛事详情
// GET  /api/works?edition=&track=&q=&limit=&offset=  筛选作品（分页 + 稳定排序）
// GET  /api/works/{workId}            作品详情
// 管理接口（本地演示令牌 x-atom-admin）：
// POST /api/admin/edition/status      {id,status}   发布/撤回一届赛事
// POST /api/admin/work/status         {id,status}   发布/撤回一件作品
// POST /api/admin/edition/rollback    {id,auditEventId}  回滚到审计事件之前的状态
// GET  /api/admin/audit               审计日志
// GET  /api/admin/import-check        来源数据导入检查（dry-run，不写状态）
import {getLiveCatalog,getStateVersion,getAudit,setEditionStatus,setWorkStatus,rollbackEdition,importDryRun,liveQueryWorks,liveFindWork,stablePage,isAdminRequest} from './publication-store.mjs';
import {SHARED_EXHIBITION} from '../src/content/exhibition.js';

const anyEdition=id=>getLiveCatalog().editions.find(e=>e.id===id);
const anyWork=id=>getLiveCatalog().editions.flatMap(e=>e.works).find(w=>w.id===id);
const publishedEditions=()=>getLiveCatalog().editions.filter(e=>e.publicationStatus==='已发布');
const publishedWorksOf=edition=>edition.works.filter(w=>w.publicationStatus==='已发布');
const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const routeId=(pathname,prefix)=>{const value=decodeURIComponent(pathname.slice(prefix.length));return value&&!value.includes('/')?value:null;};

export function contentPlugin(env={}){
 const plugin={name:'atom-content-service',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/content')&&!url.pathname.startsWith('/api/exhibitions')&&!url.pathname.startsWith('/api/works')&&!url.pathname.startsWith('/api/admin'))return next();
   if(url.pathname.startsWith('/api/admin')){
    if(!isAdminRequest(req,env))return send(res,401,{error:'需要本地运营令牌',code:'unauthorized'});
    // 后台需要看到全部状态的赛事与作品（含草稿与已撤回），否则无法重新发布。
    if(url.pathname==='/api/admin/catalog'&&req.method==='GET'){const catalog=getLiveCatalog();return send(res,200,{snapshotId:catalog.snapshotId,stateVersion:getStateVersion(),editions:catalog.editions});}
    if(url.pathname==='/api/admin/audit'&&req.method==='GET')return send(res,200,{items:getAudit(200)});
    if(url.pathname==='/api/admin/import-check'&&req.method==='GET')return send(res,200,importDryRun());
    if(req.method!=='POST')return send(res,405,{error:'管理接口仅支持 POST',code:'method_not_allowed'});
    let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>8000)return send(res,413,{error:'请求过大'});body+=chunk;}
    let data;try{data=JSON.parse(body);}catch{return send(res,400,{error:'请求格式不正确'});}
    try{
     if(url.pathname==='/api/admin/edition/status')return send(res,200,setEditionStatus(String(data.id),String(data.status),String(data.actor||'local-admin'),String(data.note||'')));
     if(url.pathname==='/api/admin/work/status')return send(res,200,setWorkStatus(String(data.id),String(data.status),String(data.actor||'local-admin'),String(data.note||'')));
     if(url.pathname==='/api/admin/edition/rollback')return send(res,200,rollbackEdition(String(data.id),String(data.auditEventId),String(data.actor||'local-admin')));
    }catch(error){return send(res,400,{error:error.message||'操作失败'});}
    return send(res,404,{error:'管理路径不存在'});
   }
   if(req.method!=='GET')return send(res,405,{error:'内容服务只读',code:'method_not_allowed'});
   if(url.pathname==='/api/content/health')return send(res,200,{ok:true,snapshotId:getLiveCatalog().snapshotId,stateVersion:getStateVersion(),editions:publishedEditions().length,works:liveQueryWorks().length});
   if(url.pathname==='/api/content/catalog'){
    const catalog=getLiveCatalog();
    const entries=publishedEditions().flatMap(publishedWorksOf).filter(w=>w.editionId===SHARED_EXHIBITION.sourceEditionId);
    const zoneSize=SHARED_EXHIBITION.zoneSize;
    return send(res,200,{snapshotId:catalog.snapshotId,stateVersion:getStateVersion(),exhibition:{id:SHARED_EXHIBITION.id,layoutVersion:SHARED_EXHIBITION.layoutVersion,zoneCount:Math.max(1,Math.ceil(entries.length/zoneSize)),entryIds:entries.map(w=>w.id)},editions:publishedEditions().map(e=>({...e,works:publishedWorksOf(e)}))});
   }
   if(url.pathname==='/api/exhibitions'){
    return send(res,200,{items:publishedEditions().map(({works,...edition})=>({...edition,workCount:works.length}))});
   }
   if(url.pathname.startsWith('/api/exhibitions/')){
    const id=routeId(url.pathname,'/api/exhibitions/');
    const edition=publishedEditions().find(e=>e.id===id);
    if(edition)return send(res,200,{...edition,works:publishedWorksOf(edition)});
    const existing=anyEdition(id);
    if(existing&&existing.publicationStatus==='已撤回')return send(res,410,{error:'该赛事已撤回',code:'withdrawn'});
    return send(res,404,{error:'赛事不存在',code:'not_found'});
   }
   if(url.pathname==='/api/works'){
    const items=liveQueryWorks({editionId:url.searchParams.get('edition'),track:url.searchParams.get('track'),q:url.searchParams.get('q')});
    const page=stablePage(items,{limit:url.searchParams.get('limit'),offset:url.searchParams.get('offset')});
    return send(res,200,page);
   }
   if(url.pathname.startsWith('/api/works/')){
    const id=routeId(url.pathname,'/api/works/');
    const work=liveFindWork(id);
    if(work)return send(res,200,work);
    const existing=anyWork(id);
    if(existing&&existing.publicationStatus==='已撤回')return send(res,410,{error:'该作品已撤回',code:'withdrawn'});
    return send(res,404,{error:'作品不存在',code:'not_found'});
   }
   return send(res,404,{error:'内容路径不存在',code:'not_found'});
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
