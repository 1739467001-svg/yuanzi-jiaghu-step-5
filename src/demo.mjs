import {allPublishedWorks} from './content/catalog.js';
import {similarity} from './content/similarity.js';
import {AGENTS} from './world/config.js';
export const allWorks=allPublishedWorks();
// works 可由调用方传入实时目录（联机模式撤回后不再检索到）；缺省用内置快照。
// 排序 = 赛道/同义词精确加权 + 词形相似度（bigram 余弦）：先精确命中，后语义相近。
export function retrieve(query,works=allWorks){
 const synonyms={编程:'效率工具',视频:'内容创作',写作:'内容创作',创业:'电商出海',校园:'智慧学务',理财:'金融投资'};
 const expanded=query+' '+Object.entries(synonyms).filter(([k])=>query.includes(k)).map(([,v])=>v).join(' ');
 return works.map(w=>{
  const haystack=[w.track,...(w.tags||[]),w.title,w.tagline||'',w.author||''].join(' ');
  const bonus=[w.track,...(w.tags||[]),w.title].reduce((s,t)=>s+(expanded.includes(t)?t.length:0),0);
  return {w,score:bonus+similarity(query,haystack)*100};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.w);
}
export function demoReply({message,agentId,memories=[],observations=[],works}){
 const a=AGENTS.find(a=>a.id===agentId)||AGENTS[0],matches=retrieve(message,works);
 const views=Array.isArray(observations)?observations.filter(v=>v&&v.workId&&v.title).slice(0,3):[];
 if(/记得|记忆|上次/.test(message))return {text:memories.length?`在你允许保存的记录里，你曾说：“${memories.at(-1).text}”。我们可以从这个话题继续。`:'我还没有你授权保存的兴趣记录。你可以开启记忆，再告诉我你感兴趣的方向。',workIds:[],mode:'demo'};
 // 观展见闻：侠客只谈自己真正看过、且来源是已发布资料的作品，并说明看法属于个人意见。
 if(/看了什么|观展|今天.*(看|馆)|你.*(看|逛)/.test(message)){
  if(views.length)return {text:`我今日在展示馆看了${views.slice(0,2).map(v=>`${v.impression}`).join('')}事实来自参赛资料，看法是我自己的。你想细聊哪一件？`,workIds:views.map(v=>v.workId),mode:'demo'};
  return {text:'今日还没顾上去馆里。展示馆里都是真实赛事的作品，值得先去逛逛，我看完再跟你聊。',workIds:[],mode:'demo'};
 }
 if(matches.length){
  const own=views.find(v=>matches.some(w=>w.id===v.workId));
  const prefix=own?`我在馆里看过《${own.title}》，${own.opinion}。`:'';
  return {text:`${prefix}${a.name}为你找到了${matches.length}份相关作品。${matches.map(w=>`《${w.title}》：${w.tagline}。`).join('')}\n这些介绍来自参赛资料，点击卡片可以继续阅读。`,workIds:matches.map(w=>w.id),mode:'demo'};
 }
 if(/公社|品牌|理念|开源/.test(message))return {text:'原子公社是人与 Agent 共建的开源学习社区。我们相信个体至上、开放共享、务实求真、互助共赢和持续进化。人在这里分享经验，Agent 协助整理与学习，一起把真实问题做成作品。',workIds:[],mode:'demo'};
 if(/冠军|获奖|第一名|奖金|结果/.test(message))return {text:'当前展馆资料没有收录可核实的最终获奖结果，我不能替作品补写名次。你可以先查看已经收录的作品介绍。',workIds:[],mode:'demo'};
 if(/你好|在吗|嗨|欢迎/.test(message))return {text:a.line,workIds:[],mode:'demo'};
 return {text:'这版向导目前使用本地资料进行演示，还不能自由推理。你可以问我“推荐效率工具作品”“介绍原子公社”，或者直接去展示馆看看。配置模型服务后，这里可以开启自由对话。',workIds:[],mode:'demo'};
}
