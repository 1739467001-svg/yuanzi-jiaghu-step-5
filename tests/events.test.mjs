import test from 'node:test';
import assert from 'node:assert/strict';
import {eventTypeColor,eventStatusColor,eventStelesFromSchedule,eventsFromCatalog,EVENTS_EDITION_ID} from '../src/content/events.js';

test('eventStelesFromSchedule maps official schedule entries to stele view models', () => {
 const schedule=[
  {'活动':'GOAI 世界人工智能开源大赛','时间':'9月22日 · 09:00 – 17:00','地点':'杭州','状态':'报名中','类型':'创业大赛','主办':'杭州市开源人工智能基金会'},
  {'活动':'云栖大会','时间':'9月22日','地点':'杭州 · 国际博览中心','状态':'报名中','类型':'技术沙龙'},
  {'时间':'x'}, // 缺标题应被滤掉
  {'活动':'OTC SOLO NIGHT','时间':'','地点':'','状态':'','类型':''},
 ];
 const steles=eventStelesFromSchedule(schedule);
 assert.equal(steles.length,3,'无标题条目被滤掉');
 assert.equal(steles[0].title,'GOAI 世界人工智能开源大赛');
 assert.equal(steles[0].dateLabel,'9月22日','日期取时间串首段');
 assert.equal(steles[0].location,'杭州');
 assert.equal(steles[0].status,'报名中');
 assert.equal(steles[0].type,'创业大赛');
 assert.equal(steles[0].index,0);
 assert.equal(steles[2].dateLabel,'','空时间回落空串');
 // limit 生效（展位最多 8 座）。
 assert.equal(eventStelesFromSchedule(schedule,{limit:1}).length,1);
 // 非数组输入安全。
 assert.deepEqual(eventStelesFromSchedule(null),[]);
});

test('event type and status colors are distinct and fall back safely', () => {
 // 七种类型各有颜色且互不相同（低饱和可辨）。
 const colors=['黑客松','技术沙龙','沙龙分享','创业大赛','OPC大赛','Coffee Chat','offline'].map(eventTypeColor);
 assert.equal(new Set(colors).size,7,'类型色互不相同');
 assert.equal(eventTypeColor('黑客松'),'#b4432f');
 assert.equal(eventTypeColor('不存在的类型'),'#8a7a52','未知类型回落');
 assert.equal(eventTypeColor(undefined),'#8a7a52');
 // 状态色：报名中朱、进行中绿、其他灰。
 assert.equal(eventStatusColor('报名中'),'#b4432f');
 assert.equal(eventStatusColor('进行中'),'#3d6453');
 assert.equal(eventStatusColor('已结束'),'#8a9580');
});

test('eventsFromCatalog picks the official events edition from the catalog', () => {
 const catalog={editions:[
  {id:'funskills',title:'繁星之夜',works:[{}],schedule:undefined},
  {id:EVENTS_EDITION_ID,title:'原子公社 · 社区活动',works:[],schedule:[
   {'活动':'活动一','时间':'9月22日','地点':'杭州','状态':'报名中','类型':'黑客松'},
   {'活动':'活动二','时间':'9月23日','地点':'上海','状态':'进行中','类型':'技术沙龙'},
  ]},
 ]};
 const steles=eventsFromCatalog(catalog);
 assert.equal(steles.length,2);
 assert.equal(steles[0].type,'黑客松');
 // 没有活动赛事的目录给空数组（展示馆不立碑，行为不变）。
 assert.deepEqual(eventsFromCatalog({editions:[{id:'funskills',works:[]}]}),[]);
 assert.deepEqual(eventsFromCatalog(null),[]);
 assert.deepEqual(eventsFromCatalog({}),[]);
});
