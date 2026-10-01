// 门派小镇预设：地形 / 建筑 / 元素 / 主题色的成套配置。
// 客户端（3D 场景与布置面板）与服务端（校验白名单）共用这一份定义——
// 服务端不信任客户端提交的布局，逐项按这里的白名单校验。见 docs/UPGRADE-PLAN.md。
// 设计原则：只做「预设可更换」，不做拖放构造（2026-09-30 决策）。

// 地形：决定小镇的环境与天际线。
export const TERRAINS=[
 {id:'village',name:'村落',desc:'聚义阁居中、旗幡夹道，最贴近原子江湖的本色。'},
 {id:'lakeside',name:'湖畔',desc:'一水绕阁，锦鲤巡游，垂柳拂波。'},
 {id:'forest',name:'林间',desc:'桃林环抱、落瓣满地，清幽议事。'},
 {id:'mountain',name:'山地',desc:'石阶层叠而上，阁据高处，远山为屏。'},
 {id:'float',name:'浮岛',desc:'阁立浮岛、云气在下，最见门派气象。'},
];
// 门派建筑：内景里的主体（可多选，位置由预设给定）。
export const TOWN_BUILDINGS=[
 {id:'yishi',name:'议事堂',desc:'聚义阁主殿，掌门与长老在此议事。'},
 {id:'wuchang',name:'演武场',desc:'弟子操练之处，木人桩与兵器架。'},
 {id:'cangshu',name:'藏书阁',desc:'存放共读书单与门派卷宗。'},
];
// 门派元素：点缀物（匾额/旗帜/灯笼/石碑等），位置由预设给定。
export const ELEMENT_TYPES=[
 {id:'plaque',name:'匾额',max:2},
 {id:'flag',name:'旗帜',max:8},
 {id:'lantern',name:'灯笼',max:8},
 {id:'stele',name:'石碑',max:4},
 {id:'rack',name:'兵器架',max:4},
 {id:'planter',name:'盆栽',max:8},
];
export const ELEMENT_IDS=ELEMENT_TYPES.map(e=>e.id);
// 门派主题色（低饱和水墨系，与他「拒绝科技蓝」的规范一致）。
export const TOWN_THEMES=[
 {id:'jianghu',name:'江湖·墨绿',roof:'#42746d',wall:'#eee2c5',accent:'#c8a24a'},
 {id:'cinnabar',name:'朱砂·赤',roof:'#b4432f',wall:'#f0e2c8',accent:'#d8a24a'},
 {id:'tea',name:'茶褐·拙',roof:'#8a6b45',wall:'#efe6cf',accent:'#a8683f'},
 {id:'indigo',name:'黛蓝·远',roof:'#4a5a7a',wall:'#e9e8dc',accent:'#9aa8c4'},
];
const themeById=id=>TOWN_THEMES.find(t=>t.id===id)||TOWN_THEMES[0];

// 预设包：一份布局 = 地形 + 建筑 + 元素 + 主题色。
export const TOWN_PRESETS=[
 {id:'village',name:'村落 · 默认',desc:'最稳妥的一档：聚义阁居中，旗幡灯笼夹道，红毡直铺。',
  layout:{terrain:'village',buildings:['yishi','wuchang'],theme:'jianghu',
   elements:[{type:'plaque',x:0,z:-9.2},{type:'flag',x:-6,z:-6},{type:'flag',x:6,z:-6},{type:'flag',x:-6,z:6},{type:'flag',x:6,z:6},{type:'lantern',x:-3,z:-6},{type:'lantern',x:3,z:-6},{type:'stele',x:0,z:12}]}},
 {id:'lakeside',name:'湖畔 · 听水',desc:'一汪碧水绕阁而过，锦鲤巡游、垂柳拂波，议事都轻几分。',
  layout:{terrain:'lakeside',buildings:['yishi','cangshu'],theme:'indigo',
   elements:[{type:'plaque',x:0,z:-9.2},{type:'flag',x:-7,z:-3},{type:'flag',x:7,z:-3},{type:'lantern',x:-4,z:3},{type:'lantern',x:4,z:3},{type:'planter',x:-9,z:8},{type:'planter',x:9,z:8},{type:'stele',x:0,z:11}]}},
 {id:'forest',name:'林间 · 落瓣',desc:'桃林环抱，风过落瓣如雨，藏书阁藏在林深处。',
  layout:{terrain:'forest',buildings:['yishi','cangshu','wuchang'],theme:'cinnabar',
   elements:[{type:'plaque',x:0,z:-9.2},{type:'flag',x:-8,z:0},{type:'flag',x:8,z:0},{type:'lantern',x:-5,z:5},{type:'lantern',x:5,z:5},{type:'planter',x:-10,z:-4},{type:'planter',x:10,z:-4},{type:'stele',x:0,z:13}]}},
 {id:'mountain',name:'山地 · 据高',desc:'石阶层叠，聚义阁据高而立，远山为屏，气象最盛。',
  layout:{terrain:'mountain',buildings:['yishi','wuchang','cangshu'],theme:'tea',
   elements:[{type:'plaque',x:0,z:-10},{type:'flag',x:-8,z:-5},{type:'flag',x:8,z:-5},{type:'flag',x:-4,z:4},{type:'flag',x:4,z:4},{type:'rack',x:-9,z:2},{type:'rack',x:9,z:2},{type:'stele',x:0,z:12}]}},
 {id:'float',name:'浮岛 · 凌云',desc:'阁立浮岛、云气在脚下，最见门派气象（规模最小的一档）。',
  layout:{terrain:'float',buildings:['yishi'],theme:'jianghu',
   elements:[{type:'plaque',x:0,z:-9},{type:'flag',x:-5,z:-4},{type:'flag',x:5,z:-4},{type:'lantern',x:-3,z:4},{type:'lantern',x:3,z:4},{type:'planter',x:-6,z:7},{type:'planter',x:6,z:7}]}},
];
export const DEFAULT_TERRAIN='village';
export function defaultLayout(){
 return JSON.parse(JSON.stringify(TOWN_PRESETS[0].layout));
}
export function presetOf(id){return TOWN_PRESETS.find(p=>p.id===id)||TOWN_PRESETS[0];}
export function themeOf(id){return themeById(id);}

// 结构校验（纯函数，服务端与客户端都用它做第一道关）。
export function validateLayoutShape(layout){
 if(!layout||typeof layout!=='object')return {ok:false,error:'布局格式不正确'};
 const terrain=String(layout.terrain||'');
 if(!TERRAINS.some(t=>t.id===terrain))return {ok:false,error:'地形不存在'};
 if(!TOWN_THEMES.some(t=>t.id===String(layout.theme||'')))return {ok:false,error:'主题色不存在'};
 const buildings=Array.isArray(layout.buildings)?layout.buildings:[];
 if(!buildings.length)return {ok:false,error:'至少保留一座建筑'};
 if(buildings.length>TOWN_BUILDINGS.length)return {ok:false,error:'建筑数量超出上限'};
 if(buildings.some(b=>!TOWN_BUILDINGS.some(x=>x.id===String(b))))return {ok:false,error:'包含未知建筑'};
 const elements=Array.isArray(layout.elements)?layout.elements:[];
 if(elements.length>32)return {ok:false,error:'元素太多，先精简一些'};
 const count={};
 for(const el of elements){
  if(!el||typeof el!=='object')return {ok:false,error:'元素格式不正确'};
  const type=String(el.type||'');
  const spec=ELEMENT_TYPES.find(e=>e.id===type);
  if(!spec)return {ok:false,error:'包含未知元素：'+type};
  count[type]=(count[type]||0)+1;
  if(count[type]>spec.max)return {ok:false,error:spec.name+'最多 '+spec.max+' 个'};
  if(!Number.isFinite(el.x)||!Number.isFinite(el.z))return {ok:false,error:'元素坐标不正确'};
  if(Math.abs(el.x)>16||Math.abs(el.z)>16)return {ok:false,error:'元素放出了小镇范围'};
 }
 return {ok:true};
}
// 归一化：把任意（已通过校验的）布局收敛成规范形态，便于 diff 与存储。
export function normalizeLayout(layout){
 const buildings=[...new Set((layout.buildings||[]).map(String))];
 const elements=(layout.elements||[]).map(el=>({type:String(el.type),x:Number(el.x),z:Number(el.z),rotY:Number(el.rotY)||0}));
 return {version:1,terrain:String(layout.terrain),theme:String(layout.theme),buildings,elements};
}
