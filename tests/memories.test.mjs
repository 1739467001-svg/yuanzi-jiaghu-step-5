import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 账号与记忆写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-memories-'));
process.env.ATOM_DATA_DIR=tmp;
const {register} = await import('../server/accounts.mjs');
const {listMemories,saveMemory,deleteMemory,deleteAllMemories,recallMemories,storeVersion,importMemories} = await import('../server/memories.mjs');

const userA=register('记忆甲','password123').id;
const userB=register('记忆乙','password123').id;

test('memories are scoped by account and agent', () => {
 saveMemory(userA,'ayuan','我喜欢内容创作');
 saveMemory(userA,'moyu','我在做一个电商选品工具');
 saveMemory(userB,'ayuan','我喜欢写作');
 assert.equal(listMemories(userA,'ayuan').length,1,'同角色仅本人可见');
 assert.equal(listMemories(userA,'').length,2,'列出本人全部角色');
 assert.equal(listMemories(userB,'ayuan')[0].text,'我喜欢写作');
 assert.equal(listMemories(userB,'ayuan').every(m=>m.text!=='我喜欢内容创作'),true,'跨账号不可读');
 // 删除他人记忆被拒绝。
 assert.equal(deleteMemory(userB,listMemories(userA,'ayuan')[0].id),false);
});

test('deletion takes effect immediately and bumps the store version', () => {
 const entry=saveMemory(userA,'ayuan','我感兴趣：效率工具');
 const before=storeVersion();
 assert.equal(recallMemories(userA,'ayuan','效率工具').length,1,'召回先限定作用域');
 assert.equal(deleteMemory(userA,entry.id),true);
 assert.equal(recallMemories(userA,'ayuan','效率工具').length,0,'删除后立即不再召回');
 assert.equal(listMemories(userA,'ayuan').length,1,'只删除目标条目（测试 1 的条目保留）');
 assert.ok(storeVersion()>before,'删除递增版本号（在途结果按版本丢弃）');
});

test('expired entries never reach recall and per-agent storage is bounded', () => {
 // 直接写入一条已过期记忆：召回必须排除。
 fs.writeFileSync(path.join(tmp,'memories.json'),JSON.stringify({entries:[{id:'mem-expired',userId:userA,agentId:'xiaoman',text:'旧兴趣',source:'test',kind:'interest',createdAt:Date.now()-86400000*10,expiresAt:Date.now()-86400000}],version:1}));
 assert.equal(recallMemories(userA,'xiaoman','旧兴趣').length,0,'过期条目不进入召回');
 for(let i=0;i<65;i++)saveMemory(userA,'zhaolu','兴趣'+i);
 const scoped=listMemories(userA,'zhaolu');
 assert.equal(scoped.length,60,'每个 (账号, 角色) 最多 60 条，超出淘汰最旧');
 assert.ok(!scoped.some(m=>m.text.includes('兴趣0')),'最旧被淘汰');
});

test('recall ranks by relevance and recency within the scope', () => {
 saveMemory(userA,'shouguan','我想看电商出海的获奖作品');
 saveMemory(userA,'shouguan','最近在研究内容创作工具');
 const top=recallMemories(userA,'shouguan','内容创作')[0];
 assert.match(top.text,/内容创作/,'相关度高的排前');
});

test('import migrates local memories into the account on user choice', () => {
 const count=importMemories(userA,[{agentId:'ayuan',text:'我喜欢写作',source:'从本机迁移'},{agentId:'ayuan',text:''},{text:'缺少角色'}]);
 assert.equal(count,1,'只迁移合法条目');
 assert.ok(listMemories(userA,'ayuan').some(m=>m.text==='我喜欢写作'));
 const removed=deleteAllMemories(userA,'ayuan');
 assert.ok(removed>=1);
 assert.equal(listMemories(userA,'ayuan').length,0,'全部删除即时生效');
});

// A08 验收口径：20 个授权案例至少 18 个正确召回；10 个无记录案例均不伪造经历。
const A08_CASES=[
 ['我在做跨境电商选品，想找提效工具','选品工具'],
 ['平时喜欢内容创作，写脚本和文案','写脚本'],
 ['对AI视频生成很感兴趣','视频生成'],
 ['最近在研究金融投资的量化策略','量化策略'],
 ['我在学开源项目的社区运营','社区运营'],
 ['想做个校园里的社团管理工具','社团管理'],
 ['关注电商出海方向的真实案例','电商出海'],
 ['喜欢效率工具和自动化流程','自动化流程'],
 ['在做生活成长类的打卡产品','打卡产品'],
 ['研究AIGC视频的商业化路径','AIGC视频'],
 ['对黑客松赛事特别上心','黑客松'],
 ['想找一起做AI应用的队友','AI应用的队友'],
 ['我在整理个人知识库','知识库'],
 ['关注智能硬件方向的创业机会','智能硬件'],
 ['喜欢研究提示词工程','提示词'],
 ['在做跨境电商的广告投放优化','广告投放'],
 ['对数据分析和可视化感兴趣','可视化'],
 ['想学习怎么做增长裂变','增长裂变'],
 ['关注Web3和链上应用','链上应用'],
 ['在做教育类的AI课程设计','AI课程'],
];
const A08_NO_RECORD=['我喜欢吃辣','明天天气怎么样','推荐一款游戏','怎么养猫','篮球比赛规则','股票代码怎么查','旅游攻略哪里好','家常菜谱','健身计划怎么定','想学钢琴'];

test('A08: 20 authorized memory cases recall correctly and 10 no-record cases invent nothing', () => {
 const agent='ayuan';
 for(const [text] of A08_CASES)saveMemory(userA,agent,text);
 let correct=0;
 const misses=[];
 for(const [text,query] of A08_CASES){
  const recalled=recallMemories(userA,agent,query);
  if(recalled.length&&recalled[0].text===text)correct++;
  else misses.push(`${query} → ${recalled[0]?.text||'(空)'}`);
 }
 assert.ok(correct>=18,`A08 召回正确率 ${correct}/20（未中：${misses.join('; ')}）`);
 for(const query of A08_NO_RECORD){
  assert.equal(recallMemories(userA,agent,query).length,0,`无记录案例不得返回内容：${query}`);
 }
});
