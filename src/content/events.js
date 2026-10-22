// 官网活动 → 3D 展位（方案 B，见 docs/THREE_D_INTEGRATION.md 3.1）：
// 展示馆里为每场官网活动立一座「活动碑」——类型着色 + 标题 + 日期地点，点碑打开活动赛事页。
// 数据来自目录里的「原子公社 · 社区活动」赛事（其 schedule 即近期活动列表，
// 由 scripts/fetch-official-events.mjs 抓取、经后台导入闭环进入目录）。
// 纯函数映射与配色集中在这里，3D 与测试共用。

// 活动类型配色（与赛道色同一思路：低饱和、可辨）。
export const EVENT_TYPE_COLORS={
 '黑客松':'#b4432f',
 '技术沙龙':'#3d6453',
 '沙龙分享':'#7a6a9e',
 '创业大赛':'#c07a2e',
 'OPC大赛':'#2e6e8e',
 'Coffee Chat':'#8a7a4e',
 'offline':'#6b7f6a',
};
const FALLBACK_COLOR='#8a7a52';
export function eventTypeColor(type){
 return EVENT_TYPE_COLORS[String(type||'').trim()]||FALLBACK_COLOR;
}
// 状态徽标色：报名中（朱）、进行中（绿）、其他（灰）。
export function eventStatusColor(status){
 const s=String(status||'');
 if(s==='报名中')return '#b4432f';
 if(s==='进行中')return '#3d6453';
 return '#8a9580';
}
// schedule 条目（{活动,时间,地点,状态,主办,类型}）→ 展位视图模型。
// 标题截 12 字（3D 牌面放不下长标题），日期取「时间」串的首段。
export function eventStelesFromSchedule(schedule,{limit=8}={}){
 if(!Array.isArray(schedule))return [];
 return schedule.slice(0,limit).map((entry,i)=>{
  const time=String(entry?.['时间']||entry?.time||'');
  const dateLabel=time.split('·')[0].trim()||time;
  const location=String(entry?.['地点']||entry?.location||'').trim();
  const status=String(entry?.['状态']||entry?.status||'').trim();
  const type=String(entry?.['类型']||entry?.type||'').trim();
  const title=String(entry?.['活动']||entry?.title||'').trim();
  if(!title)return null;
  return {index:i,title,dateLabel,location,status,type,organizer:String(entry?.['主办']||entry?.organizer||'').trim()};
 }).filter(Boolean);
}
// 目录里找活动赛事（导入的「原子公社 · 社区活动」）。
export const EVENTS_EDITION_ID='atomclub-events';
export function eventsFromCatalog(catalog,{limit=8}={}){
 const edition=catalog?.editions?.find(e=>e.id===EVENTS_EDITION_ID);
 if(!edition)return [];
 return eventStelesFromSchedule(edition.schedule,{limit});
}
