import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.resolve(import.meta.dirname,'..');
const dataPath=path.resolve(out,'src/data/editions.json');
const editions=[
 {id:'funskills',title:'繁星之夜',subtitle:'FunSkills 决赛作品展',folder:'繁星之夜-showcase',ext:'jpg',description:'从真实需求出发，让创意成为可以分享的技能。探索电商出海、金融投资、效率工具、内容创作与生活成长方向的参赛作品。',note:'现有展示资料收录 38 条记录，正式决赛名单与人数仍待运营核对。'},
 {id:'hackathon',title:'数智星光展',subtitle:'浙江工商大学 AI 黑客松',folder:'hackathon-showcase',ext:'webp',description:'从校园里的真实问题出发，18 支团队用 AI 探索学务、评奖、空间预约、科研与院务文化的新解法。',note:'作品介绍来自原展示站；技术效果与成果数字为作者资料陈述。'},
];
// 重复导入是更新而不是覆盖：已有记录保留 publicationStatus / eventStage / contentVersion，
// 新记录默认“待审核”，不自动公开。发布状态由运营在后台或数据中显式维护。
const previous=new Map();
try{
 const existing=JSON.parse(fs.readFileSync(dataPath,'utf8'));
 for(const e of existing)previous.set(e.id,e);
}catch{}
const keepEdition=(id,eventStage)=>previous.has(id)&&previous.get(id).eventStage?previous.get(id).eventStage:(eventStage||'未知');
const keepWork=work=>{
 const old=previous.get(work.editionId)?.works?.find(w=>w.id===work.id);
 if(!old)return {...work,publicationStatus:'待审核',contentVersion:1};
 return {...work,publicationStatus:old.publicationStatus||'待审核',contentVersion:Number(old.contentVersion)||1};
};
const result=editions.map(e=>{
 const folder=path.join(root,'选手作品信息',e.folder);const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(folder,'assets/data.js'),'utf8'),ctx);
 const works=ctx.window.WORKS.map(w=>{
  for(const sub of ['', 'thumbs/']){
   const target=path.join(out,'public/works',e.id,sub);fs.mkdirSync(target,{recursive:true});
   fs.copyFileSync(path.join(folder,'assets/works',sub,w.slug+'.'+e.ext),path.join(target,w.slug+'.'+e.ext));
  }
  return {id:e.id+'--'+w.slug,slug:w.slug,title:w.title,author:w.author,track:w.track,tagline:w.tagline,description:w.blurb,tags:w.tags,subtitle:w.en,poster:`/works/${e.id}/${w.slug}.${e.ext}`,thumb:`/works/${e.id}/thumbs/${w.slug}.${e.ext}`,source:`选手作品信息/${e.folder}/assets/data.js`,sourceStatus:'原展示资料',editionId:e.id,...(w.highlight?{highlight:w.highlight}:{})};
 }).map(keepWork);
 // 来源中已下线的记录保留在文件中，等待运营显式处理，不静默丢弃。
 const stale=(previous.get(e.id)?.works||[]).filter(w=>!works.some(n=>n.id===w.id));
 return {id:e.id,title:e.title,subtitle:e.subtitle,description:e.description,note:e.note,tracks:Object.keys(ctx.window.TRACKS),trackColors:Object.fromEntries(Object.entries(ctx.window.TRACKS).map(([k,v])=>[k,v.color])),works:[...works,...stale],eventStage:keepEdition(e.id),publicationStatus:previous.get(e.id)?.publicationStatus||'待审核',contentVersion:previous.get(e.id)?.contentVersion||1};
});
// 手工维护的赛事（如来自活动手册的星火计划介绍）不在展示站目录中，按原样保留，
// 不被展示站导入覆盖；仍在目录中的赛事由上面的流程更新。
for(const e of previous.values())if(!result.some(r=>r.id===e.id))result.push(e);
fs.writeFileSync(dataPath,JSON.stringify(result,null,2));
console.log('Imported',result.reduce((a,e)=>a+e.works.length,0),'works; private contacts and QR codes excluded; existing publication status preserved, new records pending review.');
