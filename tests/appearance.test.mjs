// 角色形象：清单键与可选形象一一对应，且模型文件确实在 public/models 下。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {MODELS,APPEARANCES} from '../src/world/config.js';

test('每个可选形象都在模型清单里登记过',()=>{
 assert.ok(APPEARANCES.length>=2,'至少两个形象可挑');
 for(const a of APPEARANCES)assert.ok(MODELS[a.key],a.key+' 未登记');
 assert.equal(new Set(APPEARANCES.map(a=>a.key)).size,APPEARANCES.length,'形象键不重复');
 for(const a of APPEARANCES)assert.ok(a.name&&a.note,'形象要有名字和说明');
});
test('默认形象是程序化角色',()=>{
 assert.ok(MODELS['character.default'],'默认键必须存在（删掉清单里这行即回退程序化角色）');
});
test('清单里的模型文件都真的在 public/models 下',()=>{
 for(const [key,url] of Object.entries(MODELS)){
  if(!url.startsWith('/'))continue;
  const p=path.resolve(import.meta.dirname,'..','public',url.slice(1));
  assert.ok(fs.existsSync(p),url+' 文件缺失（'+key+'）');
 }
});
