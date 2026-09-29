// 门派数据层：江湖原子门派。
// 每个注册账号（本地身份亦可）可创建自己的门派：名称（唯一）、slogan、介绍、样式。
// 三角色：门派创始人（创建者，唯一）、长老阁（自定义角色，如活动负责人/志愿者）、
// 门派弟子（称号预设：大师兄/二师兄/大师姐/二师姐/师弟/师妹/弟子）。
// 存储：data/sects.json 原子写入。读取函数保持纯函数形态——
// 配置 ATOM_SECTS_SOURCE（原子公社门派网站）后，读取改走远程快照 + 本地覆盖层（server/sects-source.mjs），
// 写入记进覆盖层；未配置时保持本地文件与内置演示数据。映射与同步语义见 docs/SECTS.md。
import fs from 'node:fs';
import path from 'node:path';
import {THEMES} from '../src/world/config.js';
import {SectSource} from './sects-source.mjs';

const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(path.resolve(import.meta.dirname,'..'),'data');
const sectsFile=()=>path.join(dataDir(),'sects.json');
export const SECT_PAGE_SIZE=4;
export const ELDER_TITLES=['长老','执法长老','传功长老','护法长老'];
export const DISCIPLE_TITLES=['大师兄','二师兄','大师姐','二师姐','师弟','师妹','弟子'];
const STYLES=Object.keys(THEMES);
const NAME_RE=/^[\u4e00-\u9fa5A-Za-z0-9·\s_-]{2,20}$/;

function readJson(file,fallback){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}
}
function writeJsonAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(value,null,2));
 fs.renameSync(tmp,file);
}
// 创建时内置演示门派：静态部署/首次启动即可看到分层内景（含全部角色）。
function demoSects(){
 const mk=(id,name,slogan,intro,style,founder,elders,disciples)=>({
  id,name,slogan,intro,style,founderId:(typeof founder==='object'?founder.id:String(founder)),founderName:(typeof founder==='object'?founder.name:('演示成员-'+String(founder).slice(-1))),createdAt:Date.now()-86400000,
  elders:elders.map(([n,t])=>({userId:'elder-'+id+'-'+n,name:n,title:t})),
  disciples:disciples.map(([n,t])=>({userId:'disciple-'+id+'-'+n,name:n,title:t})),
 });
 return [
  mk('demo-yuanqi','元气满满派','一起把想法做出来','由内容创作者组成的小社区，每周一次作品互评，成员互相打磨原型。','startup',{id:'demo-1',name:'阿原'},
   [['青禾','执法长老'],['星河','传功长老']],[['阿原','大师兄'],['小满','二师姐'],['朝露','弟子']]),
  mk('demo-jianghu','江湖茶馆分舵','一盏茶，遇见同路人','茶楼里的常驻茶客组成，负责每周的茶会主持与新人引导。','jianghu',{id:'demo-2',name:'墨语'},
   [['知微','护法长老']],[['墨语','大师姐'],['行舟','二师兄'],['星河','弟子']]),
  mk('demo-shuzhai','书山小筑','分享是最好的学习','开源学习社群，维护共读书单与学习笔记模板。','mystery',{id:'demo-3',name:'小满'},
   [['小满','执法长老'],['朝露','传功长老'],['墨语','护法长老']],[['知微','大师兄'],['青禾','弟子']]),
  mk('demo-xinghuo','星火工坊','星星之火，可以燎原','赛事共创小组，跟踪星火计划各赛道并组队参赛。','campus',{id:'demo-4',name:'行舟'},
   [['行舟','执法长老']],[['星河','大师兄'],['阿原','师弟'],['小满','师妹']]),
  mk('demo-shangu','山谷邮局','见字如晤','把每周的共创进展写成信，寄给山谷另一头的伙伴。','startup',{id:'demo-5',name:'星河'},
   [['星河','传功长老'],['阿原','护法长老']],[['小满','大师兄'],['朝露','二师姐'],['星河','师弟']]),
  mk('demo-moyin','墨吟诗社','把代码写成诗','用方言与旧体诗词记录技术人的日常，每月一期刊印。','mystery',{id:'demo-6',name:'墨语'},
   [['墨语','执法长老']],[['青禾','大师姐'],['知微','二师兄'],['星河','弟子']]),
  mk('demo-chuangyi','创意杂货铺','什么都可以试试看','收集社区里的小工具、小实验与半成品，随意取用。','jianghu',{id:'demo-7',name:'星河'},
   [['星河','护法长老']],[['星河','大师兄'],['阿原','弟子']]),
  mk('demo-yuanqi2','远山棋社','落子无悔','每周线上对局与复盘，用棋盘练判断力与耐心。','campus',{id:'demo-8',name:'知微'},
   [['知微','执法长老'],['朝露','传功长老']],[['星河','二师兄'],['小满','师妹']]),
 ];
}
// ---- 数据来源：本地文件/演示数据，或原子公社门派网站（ATOM_SECTS_SOURCE）----
let source=null;
// 由 server/index.mjs 启动时调用；返回 null 表示未配置（保持本地数据）。
export function configureSectSource(env=process.env,{dataDir:dir=dataDir()}={}){
 const base=String(env.ATOM_SECTS_SOURCE||'').trim();
 if(!base)return null;
 source=new SectSource({base,token:String(env.ATOM_SECTS_SOURCE_TOKEN||'').trim(),ttlMs:Number(env.ATOM_SECTS_TTL_MS)||300000,dataDir:dir,
  onError:msg=>{try{console.warn('[门派同步] '+msg);}catch{}}});
 source.restore();
 return source;
}
export function sectSource(){return source;}
export function sectSourceStatus(){
 return source?source.status():{kind:'local'};
}
// 手动同步（运维/后台按钮）：未配置远程时返回本地状态。
export async function refreshSectSource(){
 if(!source)return {kind:'local'};
 await source.refresh({force:true});
 return source.status();
}
export function loadSects(){
 // 远程快照（含覆盖层）优先；未配置远程时才是本地文件/演示数据。
 if(source){const s=source.snapshot();if(s.length||source.remote.length)return s;}
 const stored=readJson(sectsFile(),null);
 if(!stored||!Array.isArray(stored.sects))return demoSects();
 return stored.sects;
}
// 写入落点：远程模式下记覆盖层（远程站点暂未开放管理接口），否则照旧写本地文件。
function persist(sects){source?source.writeOverlay(sects):saveSects(sects);}
function saveSects(sects){writeJsonAtomic(sectsFile(),{sects});}
export function findSect(id){return loadSects().find(s=>s.id===id)||null;}
function cleanName(v){return String(v||'').trim();}
function memberRow(userId,name,title,allowed,fallback){
 const n=cleanName(name)||'无名侠客';
 const t=allowed.includes(title)?title:fallback;
 // 优先用账号 id；没有账号映射时按名字登记（演示/本地身份）——同一门派内按名字去重。
 return {userId:cleanName(userId)||('m-'+n),name:n,title:t};
}
function validateSect(input){
 const name=cleanName(input?.name);
 if(!name)throw new Error('请填写门派名称');
 if(name.length<2||name.length>20||!NAME_RE.test(name))throw new Error('门派名称需为 2—20 位中英文、数字或 ·');
 if(!STYLES.includes(input?.style))throw new Error('请选择门派样式');
 const slogan=cleanName(input?.slogan);
 if(slogan.length>30)throw new Error('slogan 不超过 30 字');
 const intro=cleanName(input?.intro);
 if(intro.length>200)throw new Error('门派介绍不超过 200 字');
 return {name,slogan,intro,style:input.style};
}
// 建派：名称全局唯一；创建者即门派创始人（三角色体系自动就位）。
export function createSect(input,user){
 const base=validateSect(input);
 const who={id:cleanName(user?.id)||'anon',name:cleanName(user?.name)||'无名侠客'};
 if(loadSects().some(s=>s.name===base.name))throw new Error('这个门派名已被占用，换一个吧');
 const sect={id:'sect-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),...base,founderId:who.id,founderName:who.name,createdAt:Date.now(),elders:[],disciples:[]};
 persist([...loadSects(),sect]);
 return sect;
}
// 仅创始人可改：基础资料与成员管理（长老阁/弟子）。
function assertFounder(sect,user){
 if(!user||sect.founderId!==user.id)throw new Error('只有门派创始人可以管理门派');
}
export function updateSect(id,input,user){
 const all=loadSects();const sect=all.find(x=>x.id===id);if(!sect)throw new Error('门派不存在');
 assertFounder(sect,user);
 const base=validateSect(input);
 if(loadSects().some(s=>s.id!==id&&s.name===base.name))throw new Error('这个门派名已被占用，换一个吧');
 Object.assign(sect,base);
 persist(loadSects());
 return sect;
}
export function addElder(id,member,user){
 const all=loadSects();const sect=all.find(x=>x.id===id);if(!sect)throw new Error('门派不存在');
 assertFounder(sect,user);
 const row=memberRow(member.userId,member.name,member.title,ELDER_TITLES,'长老');
 if(sect.elders.some(e=>e.userId===row.userId||e.name===row.name)||sect.disciples.some(d=>d.userId===row.userId||d.name===row.name))throw new Error(`${row.name} 已在门派中`);
 sect.elders.push(row);persist(all);return sect;
}
export function removeMember(id,userId,user){
 const all=loadSects();const sect=all.find(x=>x.id===id);if(!sect)throw new Error('门派不存在');
 assertFounder(sect,user);
 sect.elders=sect.elders.filter(e=>e.userId!==userId);
 sect.disciples=sect.disciples.filter(d=>d.userId!==userId);
 persist(all);return sect;
}
export function addDisciple(id,member,user){
 const all=loadSects();const sect=all.find(x=>x.id===id);if(!sect)throw new Error('门派不存在');
 assertFounder(sect,user);
 const row=memberRow(member.userId,member.name,member.title,DISCIPLE_TITLES,'弟子');
 if(sect.elders.some(e=>e.userId===row.userId||e.name===row.name)||sect.disciples.some(d=>d.userId===row.userId||d.name===row.name))throw new Error(`${row.name} 已在门派中`);
 sect.disciples.push(row);persist(all);return sect;
}
// 分页：每页 4 个（PRD 展示口径），顺序即创建顺序。
export function pageSects(page=1,size=SECT_PAGE_SIZE){
 const all=loadSects();
 const s=Math.max(1,Number(size)||SECT_PAGE_SIZE);
 const p=Math.max(1,Number(page)||1);
 const total=all.length;
 const pages=Math.max(1,Math.ceil(total/s));
 const cur=Math.min(p,pages);
 return {sects:all.slice((cur-1)*s,cur*s),total,page:cur,pages,pageSize:s};
}
