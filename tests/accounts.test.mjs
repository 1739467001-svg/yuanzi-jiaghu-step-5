import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 账号与会话写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-accounts-'));
process.env.ATOM_DATA_DIR=tmp;
const {register,login,logout,verify,updateProfile} = await import('../server/accounts.mjs');

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
 assert.equal(logout(session.token),true);
 assert.equal(verify(session.token),null,'登出后会话失效');
 assert.equal(logout(session.token),false);
 // 旧密码仍可登录（登出不清除账号）。
 assert.ok(login('阿丙新','password123').token);
});

test('accounts survive a restart (store is read from disk each call)', () => {
 register('阿丁','password123');
 const session=login('阿丁','password123');
 // 模拟重启：直接读盘验证持久化（模块无内存缓存）。
 const store=JSON.parse(fs.readFileSync(path.join(tmp,'accounts.json'),'utf8'));
 assert.ok(Object.values(store.users).some(u=>u.name==='阿丁'));
 assert.ok(store.sessions[session.token]);
 assert.ok(store.users[Object.keys(store.users)[0]].passHash.length>=64,'密码以 scrypt 散列存储');
});
