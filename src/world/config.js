// 布局唯一来源：建筑、入口、角色日程与展陈锚点都在此定义，产物共享 MAP_VERSION。
export const MAP_VERSION='atom-town-v1';
export const CONFIG_VERSION='characters-v1';
export const PLACES = [
 {id:'hall',name:'武林大会展示馆',short:'武林大会',subtitle:'每一份作品，都值得被看见',x:0,z:-9,w:7,d:5,kind:'hall',entry:[0,-4],description:'历届赛事与真实作品在这里相遇。阅读作品、认识作者，找到你的下一次共创灵感。'},
 {id:'tea',name:'江湖茶楼',short:'江湖茶楼',subtitle:'一盏茶，遇见同路人',x:-11,z:-6,w:5.5,d:4.5,kind:'tea',entry:[-10,-2],description:'分享正在做的事，也听听别人的新想法。这里的 AI 侠客可以聊作品、聊创作，陪你寻找下一步。'},
 {id:'workshop',name:'共创工坊',short:'共创工坊',subtitle:'把一个想法，做成一个作品',x:11,z:-5,w:5,d:5,kind:'workshop',entry:[10,-1],description:'人提供经验与认知，Agent 协助整理与探索。带上一个真实问题，和伙伴一起开始。'},
 {id:'library',name:'开源书院',short:'开源书院',subtitle:'分享，是最好的学习',x:-12,z:10,w:5,d:4,kind:'library',entry:[-8,10],description:'个体至上、开放共享、务实求真、互助共赢、持续进化。这里保存原子公社的共建理念。'},
 {id:'agora',name:'群侠论剑台',short:'论剑台',subtitle:'Agent 与 Agent 的辩论场',x:12,z:10,w:6,d:6,kind:'agora',entry:[16,7],description:'侠客们定时在此论剑：两位 AI 就一个话题各执一词，你可以到场旁观，也可以点他们加入讨论。英雄帖上贴着社区悬赏与共创任务。'},
 {id:'sect',name:'原子门派',short:'原子门派',subtitle:'社区中的小社区，聚义分立',x:6,z:10,w:4.5,d:3.5,kind:'sect',entry:[6,7],description:'每一位原子公社的成员都能在这里创立自己的门派：自定义名称、slogan、介绍与样式，设长老阁、收门下弟子，按聚义阁的位次共商共建。'},
];
export const AGENTS = [
 {id:'ayuan',name:'阿原',role:'点灯人 · 迎新伙伴',color:'#427ab5',start:[-2,0],places:['tea','hall'],line:'少侠，欢迎来到原子江湖。先喝杯茶，还是去看看大家的作品？'},
 {id:'shouguan',name:'知微',role:'守馆人 · 作品导览',color:'#719783',start:[1,-4],places:['hall','workshop'],line:'每个作品背后都有一个真实的问题。你对哪个方向感兴趣？'},
 {id:'qinghe',name:'青禾',role:'共创者 · 创业交流',color:'#94a678',start:[-9,-1],places:['tea','workshop'],line:'先找到一个值得解决的小问题，再把它做出来。你最近在探索什么？'},
 {id:'moyu',name:'墨语',role:'记录者 · 内容创作',color:'#a17b9e',start:[8,1],places:['library','tea'],line:'好的经验值得被记录。来聊聊你最想分享的一个故事。'},
 {id:'xingzhou',name:'行舟',role:'匠人 · 技术实践',color:'#b68b54',start:[10,-1],places:['workshop','hall'],line:'实践见真章。我们可以从一个能跑起来的小原型开始。'},
 {id:'xiaoman',name:'小满',role:'书友 · 开源学习',color:'#be7770',start:[-7,10],places:['library','tea'],line:'分享是最好的学习。你想从哪一类作品开始看起？'},
 {id:'zhaolu',name:'朝露',role:'探索者 · 生活成长',color:'#77969e',start:[-5,2],places:['agora','library'],line:'进步不一定很大，每天有一点新发现就很好。'},
 {id:'xinghe',name:'星河',role:'旅人 · 社区共建',color:'#7d84aa',start:[10,7],places:['agora','hall'],line:'一个人可以出发，一群人能走得更远。欢迎来江湖结识伙伴。'},
];
export const THEMES={jianghu:{name:'原子江湖',roof:'#42746d',grass:'#b9c8a3',sky:'#e9eee6'},startup:{name:'创业社区',roof:'#587c92',grass:'#bdcbb1',sky:'#e8eef0'},mystery:{name:'推理小镇',roof:'#625d79',grass:'#aab6af',sky:'#e7e5ee'},campus:{name:'虚拟校园',roof:'#ad7860',grass:'#b9cd9d',sky:'#eef0e1'}};

// GLB 资产清单：把模型文件放进 public/models/ 并在此登记，即可替换程序化几何角色；
// 缺省为空表示全部使用程序化模型。带动画的按 idle/walk 播放，无动画使用根节点兜底动画。
// 建筑暂保持程序化（入口与导航锚点依赖配置），接入指南见 docs/MODELS.md。
export const MODELS={
 // 示例基线：由 scripts/export-sample-glb.mjs 从程序化角色导出。
 // 替换为正式模型时覆盖 public/models/ 下的文件即可；删掉这一行即回退程序化角色。
 'character.default':'/models/character-default.glb',
 // 原子侠精修模型：由「原子侠_标准模型_八视图精修版.blend」经 scripts/blend-to-glb.mjs 转出
 //（35 个网格对象、抽稀到 3.4 万三角形、归一化 1.7 米、按部件名上色；无骨架动画，走根节点兜底）。
 'character.yuanzi':'/models/character-yuanzi.glb',
};
// 玩家可选形象（设置面板里挑）：键 → 展示名与说明。
export const APPEARANCES=[
 {key:'character.default',name:'江湖少侠',note:'程序化几何 · 衣带色可调'},
 {key:'character.yuanzi',name:'原子侠 · 精修',note:'汉服斗笠佩剑 · 3.4 万三角形'},
];


// 每个角色的形象：角色 id → 模型键。缺省用 character.default（程序化 + 衣带色）。
// 同一个 GLB 模型可配不同 tint（按实例染色），于是八位侠客穿同一袍型却有不同色相。
export const CHARACTER_MODELS={
 you:'character.default',                 // 玩家用设置里选的那个（见 App.jsx）
 ayuan:{key:'character.yuanzi',tint:'#427ab5'},
 shouguan:{key:'character.yuanzi',tint:'#719783'},
 qinghe:{key:'character.yuanzi',tint:'#94a678'},
 moyu:{key:'character.yuanzi',tint:'#a17b9e'},
 xingzhou:{key:'character.yuanzi',tint:'#b68b54'},
 xiaoman:{key:'character.yuanzi',tint:'#be7770'},
 zhaolu:{key:'character.yuanzi',tint:'#77969e'},
 xinghe:{key:'character.yuanzi',tint:'#7d84aa'},
};
export function modelFor(id){
 const e=CHARACTER_MODELS[id];
 return e?(typeof e==='string'?{key:e,tint:null}:e):{key:'character.default',tint:null};
}
// 茶楼共坐座位（服务端权威位置）：两桌六席，angle 为面向桌心的朝向。
export const SEATS=[
 {id:'tea-a1',label:'茶桌一 · 东席',x:-13.9,z:-1,angle:Math.PI/2},
 {id:'tea-a2',label:'茶桌一 · 南席',x:-13,z:-1.9,angle:Math.PI},
 {id:'tea-a3',label:'茶桌一 · 西席',x:-12.1,z:-1,angle:-Math.PI/2},
 {id:'tea-b1',label:'茶桌二 · 东席',x:-9.9,z:1,angle:Math.PI/2},
 {id:'tea-b2',label:'茶桌二 · 南席',x:-9,z:0.1,angle:0},
 {id:'tea-b3',label:'茶桌二 · 西席',x:-8.1,z:1,angle:-Math.PI/2},
];
