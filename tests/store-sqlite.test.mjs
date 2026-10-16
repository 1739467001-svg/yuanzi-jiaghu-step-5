import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// SQLite 后端：数据写在临时目录，不碰工程内的 data/。
// 这里镜像 tests/accounts.test.mjs / memories.test.mjs / follows.test.mjs 的核心断言——
// 两个后端必须行为一致，改任一侧都应保持两边全绿。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sqlite-'));
process.env.ATOM_DATA_DIR=tmp;
process.env.ATOM_STORE='sqlite';
const store=await import('../server/store.mjs');
const {register,login,logout,verify,updateProfile,findOrCreateExternal,issueSession,
 listMemories,saveMemory,deleteMemory,deleteAllMemories,recallMemories,storeVersion,importMemories,
 listFollows,isFollowing,addFollow,removeFollow}=store;

test('sqlite backend is active and store functions are wired', () => {
 assert.equal(store.usingSqlite,true);
 assert.equal(typeof store.migrateStore,'function','迁移函数仅 SQLite 后端提供');
 storeVersion(); // 首次使用才建库
 assert.ok(fs.existsSync(path.join(tmp,'atom.db')),'库文件落在 ATOM_DATA_DIR');
});

test('register creates a profile and login issues a session', () => {
 const user=register('阿甲','password123','#719783');
 assert.match(user.id,/^u-/);
 assert.equal(user.name,'阿甲');
 assert.equal(user.color,'#719783');
 assert.equal(user.passHash,undefined,'对外不暴露密码散列');
 const session=login('阿甲','password123');
 assert.ok(session.token);
 assert.equal(session.user.id,user.id);
 const verified=verify(session.token);
 assert.equal(verified.userId,user.id);
 assert.equal(verified.user.name,'阿甲');
});

test('wrong passwords and duplicate names are rejected', () => {
 register('阿乙','password123');
 assert.throws(()=>login('阿乙','wrong-pass'),/不正确/);
 assert.throws(()=>login('不存在','password123'),/不正确/);
 assert.throws(()=>register('阿乙','password123'),/已被使用/);
 assert.throws(()=>register('','password123'),/1—20/);
 assert.throws(()=>register('阿丙','12345'),/至少 6 位/);
 assert.throws(()=>register('阿丙','password123','red'),/颜色/);
});

test('logout invalidates the session and profile updates need a valid token', () => {
 register('阿丙','password123','#427ab5');
 const session=login('阿丙','password123');
 const updated=updateProfile(session.token,{name:'阿丙新',color:'#be7770'});
 assert.equal(updated.name,'阿丙新');
 assert.equal(updated.color,'#be7770');
 assert.equal(verify(session.token).user.name,'阿丙新','会话看到最新名帖');
 assert.throws(()=>updateProfile('bad-token',{name:'x'}),/失效/);
 assert.throws(()=>updateProfile(session.token,{model:'不存在的模型'}),/角色形象不存在/);
 assert.equal(logout(session.token),true);
 assert.equal(verify(session.token),null,'登出后会话失效');
 assert.equal(logout(session.token),false);
 // 旧密码仍可登录（登出不清除账号）。
 assert.ok(login('阿丙新','password123').token);
});

test('duplicate rename is rejected and model can be cleared', () => {
 register('阿丁','password123');
 register('阿戊','password123');
 const session=login('阿丁','password123');
 assert.throws(()=>updateProfile(session.token,{name:'阿戊'}),/已被使用/);
 const cleared=updateProfile(session.token,{model:null});
 assert.equal(cleared.model,undefined,'传 null 用回默认形象');
});

test('expired sessions are rejected and removed lazily', () => {
 register('阿己','password123');
 const session=login('阿己','password123');
 // 直接把会话改成已过期（白盒：验证懒清理——命中即删，不等别人登录）。
 const db=new DatabaseSync(path.join(tmp,'atom.db'));
 db.prepare('UPDATE sessions SET expires_at=1 WHERE token=?').run(session.token);
 db.close();
 assert.equal(verify(session.token),null,'过期会话不可用');
 const db2=new DatabaseSync(path.join(tmp,'atom.db'));
 assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token=?').get(session.token).n,0,'过期会话被懒清理删除');
 db2.close();
});

test('external subject maps to a stable local account', () => {
 const first=findOrCreateExternal('sub-123','社区侠客');
 const again=findOrCreateExternal('sub-123','社区侠客');
 assert.equal(again.id,first.id,'同一 subject 始终同一账号');
 const other=findOrCreateExternal('sub-456',first.name);
 assert.notEqual(other.id,first.id,'不同 subject 不同账号');
 assert.notEqual(other.name,first.name,'同名自动区分');
 assert.ok(issueSession(first.id),'外部账号可签发本地会话');
});

test('memories are scoped by account and agent', () => {
 const userA=register('记忆甲','password123').id;
 const userB=register('记忆乙','password123').id;
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
 const user=register('记忆丙','password123').id;
 saveMemory(user,'ayuan','我感兴趣：效率工具');
 const before=storeVersion();
 assert.equal(recallMemories(user,'ayuan','效率工具').length,1,'删除前可召回');
 assert.equal(deleteMemory(user,listMemories(user,'ayuan')[0].id),true);
 assert.equal(storeVersion()>before,true,'删除递增版本号');
 assert.equal(recallMemories(user,'ayuan','效率工具').length,0,'删除后不再召回');
});

test('recall ranks by similarity and does not fabricate', () => {
 const user=register('记忆丁','password123').id;
 saveMemory(user,'ayuan','我在做一个面向内容创作者的工具');
 saveMemory(user,'ayuan','最近在学水下摄影');
 saveMemory(user,'ayuan','喜欢爬山和露营');
 const hits=recallMemories(user,'ayuan','内容创作');
 assert.equal(hits.length,1);
 assert.match(hits[0].text,/内容创作者/);
 // 无记录的问题不伪造经历。
 assert.deepEqual(recallMemories(user,'ayuan','量子计算的前沿进展'),[]);
 // 每 (账号, 角色) 60 条有界。
 for(let i=0;i<70;i++)saveMemory(user,'moyu',`兴趣${i}`);
 assert.equal(listMemories(user,'moyu').length,60);
});

test('importMemories migrates local entries into the account', () => {
 const user=register('记忆戊','password123').id;
 const count=importMemories(user,[
  {agentId:'ayuan',text:'从本机迁来的兴趣：手工咖啡',source:'从本机迁移'},
  {agentId:'moyu',text:'从本机迁来的兴趣：骑行',source:'从本机迁移'},
  {agentId:'',text:'缺 agentId 的坏行'},
  {text:'缺 agentId 的坏行'},
 ]);
 assert.equal(count,2);
 assert.equal(listMemories(user,'ayuan')[0].source,'从本机迁移');
});

test('follows are isolated by account and split by type', () => {
 const userA=register('关注甲','password123').id;
 const userB=register('关注乙','password123').id;
 assert.equal(addFollow(userA,'ai','ayuan').duplicate,false);
 assert.equal(addFollow(userA,'player','u-other').duplicate,false);
 assert.equal(isFollowing(userA,'ai','ayuan'),true);
 assert.equal(isFollowing(userA,'ai','moyu'),false);
 assert.equal(listFollows(userA).length,2);
 assert.equal(listFollows(userA,'ai').length,1,'真人与 AI 分开查询');
 assert.equal(addFollow(userA,'ai','ayuan').duplicate,true,'重复关注不新增');
 assert.equal(removeFollow(userA,'ai','ayuan').removed,true);
 assert.equal(isFollowing(userA,'ai','ayuan'),false);
 assert.equal(listFollows(userA).length,1);
 addFollow(userB,'ai','moyu');
 assert.equal(isFollowing(userA,'ai','moyu'),false,'B 的关注对 A 不可见');
 assert.equal(listFollows(userB,'ai').length,1);
 assert.throws(()=>addFollow(userA,'bot','x'),/关注类型/);
 assert.throws(()=>addFollow(userA,'ai',''),/缺少关注对象/);
});

test('migrateFromJson imports JSON data idempotently', () => {
 // 另起一个临时目录写 JSON 源，模拟从旧部署迁过来。
 const src=fs.mkdtempSync(path.join(os.tmpdir(),'atom-sqlite-src-'));
 fs.writeFileSync(path.join(src,'accounts.json'),JSON.stringify({
  users:{'u-old':{id:'u-old',name:'老账号',color:'#123456',salt:'',passHash:'',createdAt:'2026-01-01T00:00:00.000Z'}},
  sessions:{'tok-old':{userId:'u-old',createdAt:1,expiresAt:Date.now()+86400000}},
 },null,2));
 fs.writeFileSync(path.join(src,'memories.json'),JSON.stringify({
  version:7,
  entries:[{id:'mem-old',userId:'u-old',agentId:'ayuan',text:'老账号的兴趣：篆刻',source:'历史',kind:'interest',createdAt:2,expiresAt:null}],
 },null,2));
 fs.writeFileSync(path.join(src,'follows.json'),JSON.stringify({
  items:[{userId:'u-old',targetType:'ai',targetId:'ayuan',createdAt:3}],
 },null,2));
 const {migrateStore}=store;
 const first=migrateStore({dataDir:src});
 assert.equal(first.users,1);
 assert.equal(first.sessions,1);
 assert.equal(first.memories,1);
 assert.equal(first.follows,1);
 assert.ok(storeVersion()>=7,'记忆版本号取 JSON 与库中较大值');
 // 幂等：重跑不重复（INSERT OR REPLACE / OR IGNORE，changes 归零）。
 const second=migrateStore({dataDir:src});
 assert.equal(second.users,1,'users 覆盖写');
 assert.equal(second.follows,0,'follows 已存在，不重复插入');
 assert.equal(listMemories('u-old','ayuan').length,1,'memories 用 REPLACE，不重复');
 assert.equal(listFollows('u-old').length,1,'关注不重复');
 // 迁过来的账号可以正常登录态验证与关注查询。
 const session=verify('tok-old');
 assert.equal(session.userId,'u-old');
 assert.equal(session.user.name,'老账号');
 assert.equal(isFollowing('u-old','ai','ayuan'),true);
});
