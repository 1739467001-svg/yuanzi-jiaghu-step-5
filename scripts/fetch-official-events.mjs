#!/usr/bin/env node
// 官网活动抓取：把原子公社社区站的活动数据变成「赛事导入」载荷，让 3D 展示馆的
// 赛事目录里有官网真实活动（ organizers/schedule/awards 全部来自线上，不是手写）。
//
// 用法：
//   node scripts/fetch-official-events.mjs                 # 拉取并写 artifacts/official-events-payload.json
//   node scripts/fetch-official-events.mjs --print         # 只打印摘要不写文件
//
// 拿到载荷后：运营后台 →「赛事导入」→ 粘贴 JSON → 预检 → 确认导入 → 发布。
// 全程不改代码、留痕可回滚（导入落 data/publication-overrides.json，与既有闭环一致）。
// 官网不可用时脚本失败退出——内容基线不掺假数据，宁缺毋滥。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.ATOM_OFFICIAL_SITE||'https://atomclub.cn';
const EDITION_ID='atomclub-events';
const onlyPrint=process.argv.includes('--print');

const get=async p=>{
 const response=await fetch(base+p,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`${p} → HTTP ${response.status}`);
 return response.json();
};

// 活动类型中文口径（官网 /api/events/types 的原值）。
const TYPE_LABEL={};

function pickUpcoming(events,limit){
 return events
  .filter(e=>e.status!=='ended')
  .sort((a,b)=>String(a.startAt||'').localeCompare(String(b.startAt||'')))
  .slice(0,limit);
}

try{
 const [eventsRes,stats,types]=await Promise.all([
  get('/api/events?limit=100'),
  get('/api/events/stats'),
  get('/api/events/types'),
 ]);
 const events=Array.isArray(eventsRes)?eventsRes:(eventsRes.list||[]);
 if(!events.length)throw new Error('官网没有返回任何活动');
 const upcoming=pickUpcoming(events,8);
 if(!upcoming.length)throw new Error('官网暂无未结束的活动');

 // 真实口径：累计场次、类型分布、主要主办方，全部来自 stats。
 const typeStats=(stats.typeStats||[]).sort((a,b)=>b.count-a.count);
 const organizers=(stats.organizers||[]).slice(0,8);

 const edition={
  id:EDITION_ID,
  title:'原子公社 · 社区活动',
  subtitle:'官网实时活动 · '+types.filter(t=>!['offline'].includes(t)).slice(0,4).join(' / '),
  description:`原子公社社区里正在发生的真实活动。这里是 3D 互动平台，活动详情与报名在官网进行；累计 ${stats.total||events.length} 场活动，${typeStats[0]?`以${typeStats[0].type}为主（${typeStats[0].count} 场）`:''}。走进展示馆的侠客，也会聊起这些活动。`,
  tracks:['全部'],
  eventStage:'进行中',
  // 官网活动没有海报作品，这一版是「赛事介绍」形态（与星火计划同款：资料以官网为准）。
  works:[],
  organizers:{
   '主办社区':['原子公社 AtomHub','原子之心 Atomesh'],
   '累计活动':`${stats.total||events.length} 场`,
   '主要主办方':organizers,
  },
  schedule:upcoming.map(e=>({
   '活动':e.title,
   '时间':`${e.dateLabel||e.startAt||''}${e.timeLabel?' · '+e.timeLabel:''}`,
   '地点':[e.city,e.location].filter(Boolean).join(' · ')||'线上',
   '状态':e.status==='ongoing'?'进行中':e.status==='upcoming'?'报名中':'已结束',
   ...(e.organizer?{'主办':e.organizer}:{}),
  })),
  awards:{
   '活动类型分布':typeStats.map(t=>`${t.type} ${t.count} 场`).join(' · '),
   '明细':typeStats.map(t=>({'类型':t.type,'场次':String(t.count)})),
  },
  benefits:[
   '活动详情、报名与签到在原子公社官网进行',
   '3D 展示馆里的 AI 侠客会聊起这些活动——先来和它们聊聊',
   '加入社区即可创建自己的门派，参与共创',
  ],
  officialUrl:base+'/events',
  note:'来源：原子公社官网 API（'+base+'/api/events），抓取于 '+new Date().toISOString().slice(0,10)+'。重新抓取：node scripts/fetch-official-events.mjs。',
 };
 const payload={editions:[edition]};
 if(onlyPrint){
  console.log(`即将导入的赛事：${edition.title}`);
  console.log(`  累计活动 ${stats.total||events.length} 场 · 近期活动 ${upcoming.length} 条 · 主办方 ${organizers.length} 家`);
  console.log('  近期活动：');
  for(const e of upcoming)console.log(`   - [${e.type}] ${e.title}（${e.dateLabel||e.startAt} · ${e.city||''}）`);
 }else{
  const out=path.join(root,'artifacts','official-events-payload.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(payload,null,2));
  console.log(`已写入 ${out}`);
  console.log(`赛事：${edition.title}（${edition.id}）· 累计 ${stats.total||events.length} 场 · 近期活动 ${upcoming.length} 条`);
  console.log('下一步：运营后台 →「赛事导入」→ 粘贴该 JSON → 预检 → 确认导入 → 发布。');
 }
}catch(error){
 console.error('抓取失败：'+(error.message||error));
 console.error('官网不可用时不要写入假数据——修好网络或确认地址后重试（可用 ATOM_OFFICIAL_SITE 覆盖地址）。');
 process.exit(1);
}
