// 内容契约：赛事、赛道、作品的规范化、发布过滤与查询。
// 3D 展厅、阅读目录、AI 导览和服务端接口都从这里读取同一份已发布数据。
import rawEditions from '../data/editions.json' with {type:'json'};

export const EVENT_STAGES=['预告','报名','进行中','评审中','已结束','未知'];
export const PUBLICATION_STATUSES=['草稿','待审核','已发布','已撤回'];
const PRIVATE_FIELDS=['wechat','qr','contact','phone','email'];
const SNAPSHOT_ID='editions-snapshot-v1';

export function normalizeEdition(raw){
 if(!raw||typeof raw!=='object')throw new Error('赛事条目必须是对象');
 const {id,title,tracks,works}=raw;
 if(typeof id!=='string'||!id)throw new Error('赛事缺少稳定 id');
 if(typeof title!=='string'||!title)throw new Error(`赛事 ${id} 缺少标题`);
 if(!Array.isArray(tracks)||!tracks.some(t=>typeof t==='string'&&t))throw new Error(`赛事 ${id} 缺少赛道`);
 if(!Array.isArray(works))throw new Error(`赛事 ${id} 缺少作品列表`);
 const eventStage=raw.eventStage||'未知';
 if(!EVENT_STAGES.includes(eventStage))throw new Error(`赛事 ${id} 的 eventStage 非法: ${eventStage}`);
 const publicationStatus=raw.publicationStatus||'草稿';
 if(!PUBLICATION_STATUSES.includes(publicationStatus))throw new Error(`赛事 ${id} 的 publicationStatus 非法: ${publicationStatus}`);
 const contentVersion=Number(raw.contentVersion)||1;
 return {...raw,eventStage,publicationStatus,contentVersion,
  works:works.map(w=>normalizeWork(w,id))};
}
function normalizeWork(raw,editionId){
 if(!raw||typeof raw!=='object')throw new Error(`赛事 ${editionId} 的作品条目必须是对象`);
 const {id,title,author,track}=raw;
 if(typeof id!=='string'||!id)throw new Error(`赛事 ${editionId} 有作品缺少稳定 id`);
 if(raw.editionId&&raw.editionId!==editionId)throw new Error(`作品 ${id} 的 editionId 与所属赛事不一致`);
 if(!id.startsWith(editionId+'--'))throw new Error(`作品 ${id} 必须以 ${editionId}-- 开头`);
 if(typeof title!=='string'||!title)throw new Error(`作品 ${id} 缺少标题`);
 if(typeof author!=='string'||!author)throw new Error(`作品 ${id} 缺少作者`);
 if(typeof track!=='string'||!track)throw new Error(`作品 ${id} 缺少赛道`);
 const publicationStatus=raw.publicationStatus||'草稿';
 if(!PUBLICATION_STATUSES.includes(publicationStatus))throw new Error(`作品 ${id} 的 publicationStatus 非法: ${publicationStatus}`);
 const work={...raw,editionId,publicationStatus,contentVersion:Number(raw.contentVersion)||1};
 for(const field of PRIVATE_FIELDS)delete work[field];
 return work;
}
export function normalizeCatalog(rawEditions){
 if(!Array.isArray(rawEditions))throw new Error('目录必须是赛事数组');
 const editions=rawEditions.map(normalizeEdition);
 const ids=editions.map(e=>e.id);
 if(new Set(ids).size!==ids.length)throw new Error('赛事 id 重复');
 const workIds=editions.flatMap(e=>e.works.map(w=>w.id));
 if(new Set(workIds).size!==workIds.length)throw new Error('作品 id 重复');
 return {snapshotId:SNAPSHOT_ID,editions};
}

export const catalog=normalizeCatalog(rawEditions);
export function publishedEditions(){return catalog.editions.filter(e=>e.publicationStatus==='已发布');}
export function publishedWorksOf(edition){return edition.works.filter(w=>w.publicationStatus==='已发布');}
export function allPublishedWorks(){return publishedEditions().flatMap(publishedWorksOf);}
export function findEdition(id){return publishedEditions().find(e=>e.id===id);}
export function findWork(id){return allPublishedWorks().find(w=>w.id===id);}
// 赛道色来自来源展示站的 TRACKS 定义，用于 3D 展位与阅读面板的统一视觉标识。
export function trackColorOf(work){
 if(!work)return null;
 const edition=catalog.editions.find(e=>e.id===work.editionId);
 return edition?.trackColors?.[work.track]||null;
}
export function queryWorks({editionId,track,q}={}){
 const needle=(q||'').trim().toLocaleLowerCase();
 return allPublishedWorks().filter(work=>
  (!editionId||work.editionId===editionId)&&
  (!track||track==='全部'||work.track===track)&&
  (!needle||[work.title,work.author,work.track,work.tagline,work.description,...(work.tags||[])].join(' ').toLocaleLowerCase().includes(needle)));
}
