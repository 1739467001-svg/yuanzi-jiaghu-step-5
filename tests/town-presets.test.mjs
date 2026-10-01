// 门派小镇预设与布局校验单测：白名单、边界、归一化、默认布局。
import test from 'node:test';
import assert from 'node:assert/strict';
import {TERRAINS,TOWN_BUILDINGS,ELEMENT_TYPES,TOWN_THEMES,TOWN_PRESETS,defaultLayout,presetOf,themeOf,validateLayoutShape,normalizeLayout} from '../src/world/townPresets.js';

test('五套预设都合法，且覆盖五种地形',()=>{
 assert.equal(TOWN_PRESETS.length,5);
 assert.deepEqual(TOWN_PRESETS.map(p=>p.layout.terrain).sort(),TERRAINS.map(t=>t.id).sort());
 for(const p of TOWN_PRESETS){
  const checked=validateLayoutShape(p.layout);
  assert.ok(checked.ok,p.id+' 预设应通过校验：'+checked.error);
  assert.ok(p.layout.buildings.length>=1,p.id+' 至少一座建筑');
  assert.ok(p.layout.elements.length>=4,p.id+' 至少有陈设');
 }
});
test('默认布局 = 村落预设',()=>{
 const d=defaultLayout();
 assert.equal(d.terrain,'village');
 assert.deepEqual(d.buildings,TOWN_PRESETS[0].layout.buildings);
});
test('校验拒绝：坏地形/坏主题/空建筑/未知建筑/未知元素/超量/出界',()=>{
 const base=defaultLayout();
 assert.equal(validateLayoutShape({...base,terrain:'nope'}).error,'地形不存在');
 assert.equal(validateLayoutShape({...base,theme:'nope'}).error,'主题色不存在');
 assert.equal(validateLayoutShape({...base,buildings:[]}).error,'至少保留一座建筑');
 assert.equal(validateLayoutShape({...base,buildings:['nope']}).error,'包含未知建筑');
 assert.equal(validateLayoutShape({...base,elements:[{type:'nope',x:0,z:0}]}).error,'包含未知元素：nope');
 // 元素超量
 const many=Array.from({length:9},()=>({type:'flag',x:0,z:0}));
 assert.match(validateLayoutShape({...base,elements:many}).error,/旗帜最多 8 个/);
 // 坐标出界
 assert.equal(validateLayoutShape({...base,elements:[{type:'flag',x:99,z:0}]}).error,'元素放出了小镇范围');
 // 非数字坐标
 assert.equal(validateLayoutShape({...base,elements:[{type:'flag',x:'a',z:0}]}).error,'元素坐标不正确');
});
test('归一化：补齐版本号、去重建筑、数字坐标',()=>{
 const out=normalizeLayout({terrain:'forest',theme:'tea',buildings:['yishi','yishi','wuchang'],elements:[{type:'flag',x:'3',z:'4'},{type:'lantern',x:1,z:2,rotY:'0.5'}]});
 assert.equal(out.version,1);
 assert.deepEqual(out.buildings,['yishi','wuchang']);
 assert.deepEqual(out.elements[0],{type:'flag',x:3,z:4,rotY:0});
 assert.equal(out.elements[1].rotY,.5);
});
test('主题色与预设查询有兜底',()=>{
 assert.equal(themeOf('不存在').id,TOWN_THEMES[0].id);
 assert.equal(presetOf('不存在').id,TOWN_PRESETS[0].id);
 for(const t of TOWN_THEMES)assert.match(t.roof,/^#[0-9a-f]{6}$/i,'主题色是十六进制');
});
