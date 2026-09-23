import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-follows-'));
process.env.ATOM_DATA_DIR=tmp;
const {register} = await import('../server/accounts.mjs');
const {listFollows,isFollowing,addFollow,removeFollow} = await import('../server/follows.mjs');

const userA=register('关注甲','password123').id;
const userB=register('关注乙','password123').id;

test('follows are added, listed and removed per account', () => {
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
});

test('follows never leak across accounts', () => {
 addFollow(userB,'ai','moyu');
 assert.equal(isFollowing(userA,'ai','moyu'),false,'B 的关注对 A 不可见');
 assert.equal(listFollows(userA,'ai').length,0);
 assert.equal(listFollows(userB,'ai').length,1);
 // 移除他人的关注不影响自己。
 removeFollow(userA,'ai','moyu');
 assert.equal(isFollowing(userB,'ai','moyu'),true);
});

test('invalid follow targets are rejected', () => {
 assert.throws(()=>addFollow(userA,'bot','x'),/关注类型/);
 assert.throws(()=>addFollow(userA,'ai',''),/缺少关注对象/);
});
