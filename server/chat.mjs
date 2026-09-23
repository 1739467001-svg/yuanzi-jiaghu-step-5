// 本地资料检索与模型代理。私人对话统一走 server/agent-brain.mjs：
// 未配置模型时是明确标注的本地演示；配置后调用真实模型并受持久预算约束。
// 私人聊天需要登录（PRD 4.1：游客不发送私聊）；授权记忆由服务端按账号读取，
// 不把客户端提交的历史或记忆当作可信事实。
import {AGENTS} from '../src/world/config.js';
import {retrieve,demoReply} from '../src/demo.mjs';
import {generateAgentReply} from './agent-brain.mjs';
import {verify} from './accounts.mjs';
import {recallMemories,listMemories,recallMemoriesAsync} from './memories.mjs';
export {allWorks,retrieve,demoReply} from '../src/demo.mjs';
export function chatPlugin(env){
 const plugin={name:'atom-local-chat',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/chat'&&url.pathname!=='/api/status')return next();
  const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  if(url.pathname==='/api/status')return send(200,{mode:env.ATOM_LLM_API_KEY?'model':'demo',model:env.ATOM_LLM_API_KEY?env.ATOM_LLM_MODEL||'configured':null});
  if(url.pathname!=='/api/chat'||req.method!=='POST')return send(404,{error:'接口不存在'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'请求来源不受支持'});
  let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>24000)return send(413,{error:'消息过长'});body+=chunk;}
  let data;try{data=JSON.parse(body);}catch{return send(400,{error:'消息格式不正确'});}
  if(!data||typeof data!=='object'||typeof data.message!=='string'||!data.message.trim()||data.message.length>1000||!AGENTS.some(a=>a.id===data.agentId))return send(400,{error:'请填写有效消息，最多 1000 字'});
  // 私人聊天是成员能力：需要有效会话；记忆按账号从服务端读取。
  const session=verify(data.token);
  if(!session)return send(401,{error:'请先登录再与侠客私聊'});
  // "你记得我吗"类问题返回该角色全部记忆（问的是记得什么）；其余按相关性召回。
  const memoryIntent=/记得|记忆|上次|回忆/.test(data.message);
  const memories=(memoryIntent?listMemories(session.userId,data.agentId):await recallMemoriesAsync(session.userId,data.agentId,data.message)).map(m=>({text:m.text}));
  const observations=Array.isArray(data.observations)?data.observations.filter(v=>v&&typeof v.title==='string').slice(0,3).map(v=>({workId:String(v.workId||'').slice(0,60),title:v.title.slice(0,40),tagline:String(v.tagline||'').slice(0,60),impression:String(v.impression||'').slice(0,80),opinion:String(v.opinion||'').slice(0,40)})):[];
  const history=Array.isArray(data.history)?data.history.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-8):[];
  const reply=await generateAgentReply({agentId:data.agentId,message:data.message,history,observations,memories,env});
  return send(200,{text:reply.text,workIds:reply.workIds,mode:reply.mode});
 });}};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
