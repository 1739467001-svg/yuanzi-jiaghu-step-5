// 静态部署（Vercel 等没有 /api/sects）时的门派本地演示层：
// 演示门派 + 本机自建门派（localStorage 覆盖层），分页/查找与服务端口径一致。
// 接入世界服务端或原子公社门派网站后，这份覆盖层不再参与（读取函数见 docs/SECTS.md）。
import {DEMO_SECTS} from './demoSects.js';
const KEY='atomLocalSects';
function readStore(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function localSects(){return readStore(KEY,[]);}
function allSects(){return [...DEMO_SECTS,...localSects()].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));}
// 分页：与 server/sects.mjs 的 pageSects 同构（每页 4，顺序即创建顺序）。
export function pageSects(page=1,size=4){
 const all=allSects(),s=Math.max(1,Number(size)||SECT_PAGE_SIZE),p=Math.max(1,Number(page)||1);
 const total=all.length,pages=Math.max(1,Math.ceil(total/s)),cur=Math.min(p,pages);
 return {sects:all.slice((cur-1)*s,cur*s),total,page:cur,pages,pageSize:s};
}
export function findSect(id){return allSects().find(s=>s.id===id)||null;}
 const STYLES=['jianghu','startup','mystery','campus'];
// 自建门派：同一浏览器内名称同样要唯一（与服务端口径一致）。
export function createSect(input,user){
 const name=String(input?.name||'').trim();
 if(!name)throw new Error('请填写门派名称');
 if(name.length<2||name.length>20)throw new Error('门派名称需为 2—20 位');
 if(!STYLES.includes(input?.style))throw new Error('请选择门派样式');
 if(allSects().some(s=>s.name===name))throw new Error('这个门派名已被占用，换一个吧');
 const slogan=String(input?.slogan||'').trim();
 if(slogan.length>30)throw new Error('slogan 不超过 30 字');
 const intro=String(input?.intro||'').trim();
 if(intro.length>200)throw new Error('门派介绍不超过 200 字');
 const sect={id:'local-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
  name,slogan,intro,style:input.style,
  founderId:user?.id||'local-you',founderName:user?.name||'本机少侠',createdAt:Date.now(),elders:[],disciples:[]};
 writeStore(KEY,[...localSects(),sect]);
 return sect;
}
// 成员增删：仅创始人（本地演示层只可能改自己的门派）。
export function updateMembers(id,user,change){
 const list=localSects(),sect=list.find(s=>s.id===id);
 if(!sect)throw new Error('门派不存在');
 if(sect.founderId!==(user?.id||'local-you'))throw new Error('只有门派创始人可以管理门派');
 change(sect);
 writeStore(KEY,list);
 return {...sect};
}
