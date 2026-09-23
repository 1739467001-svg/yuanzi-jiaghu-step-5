// 共享展陈：每个房间固定一份已发布的 exhibitionId + layoutVersion。
// 真人与 AI 对同一展位看到相同作品；个人筛选只改变阅读面板，不改变展板。
// 首个共享展览按 PRD 待确认清单的默认方案：优先 FunSkills 审核通过作品。
// works 可由调用方传入实时目录（运营撤回后展位与房间一致更新）。
import {allPublishedWorks} from './catalog.js';

export const SHARED_EXHIBITION={
 id:'exp-funskills-main-v1',
 title:'繁星之夜 · 推荐展陈',
 sourceEditionId:'funskills',
 layoutVersion:1,
 zoneSize:8,
};
export function exhibitionEntries(exhibition=SHARED_EXHIBITION,works=allPublishedWorks()){
 return exhibition.sourceEditionId?works.filter(w=>w.editionId===exhibition.sourceEditionId):works;
}
export function exhibitionZoneCount(exhibition=SHARED_EXHIBITION,works=allPublishedWorks()){
 return Math.max(1,Math.ceil(exhibitionEntries(exhibition,works).length/exhibition.zoneSize));
}
export function exhibitionZone(exhibition=SHARED_EXHIBITION,zoneIndex=0,works=allPublishedWorks()){
 const entries=exhibitionEntries(exhibition,works);
 const start=zoneIndex*exhibition.zoneSize;
 return entries.slice(start,start+exhibition.zoneSize);
}
export function isExhibited(workId,exhibition=SHARED_EXHIBITION,zoneIndex=0,works=allPublishedWorks()){
 return exhibitionZone(exhibition,zoneIndex,works).some(w=>w.id===workId);
}
