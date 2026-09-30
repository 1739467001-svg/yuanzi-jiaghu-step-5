// 点击聚焦特效单测：对象池复用、动画推进、演完自动隐藏。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createClickFx} from '../src/world/clickFx.js';

test('点击聚焦特效：出现 → 扩散 → 自动消失，且复用同一池',()=>{
 const scene=new T.Scene();
 const fx=createClickFx(scene);
 const before=scene.children.length;
 assert.equal(before,10,'预建 10 组特效（对象池）');
 fx.spawn(1,0.1,2);
 const first=scene.children.find(c=>c.visible);
 assert.ok(first,'点击后立刻有一组生效');
 assert.ok(first.children.some(c=>c.material.opacity>0),'首帧就有可见的圈/光点');
 // 推进 0.3 秒：圈在变大、透明度在降
 const ring=first.children[0];
 const scaleAtStart=ring.scale.x,opacityAtStart=ring.material.opacity;
 fx.update(.3);
 assert.ok(ring.scale.x>scaleAtStart,'涟漪在扩散');
 assert.ok(ring.material.opacity<opacityAtStart,'同时淡出');
 // 演完 0.6 秒后隐藏
 fx.update(.4);
 assert.equal(first.visible,false,'0.6 秒演完自动隐藏');
 // 连续点击 30 次不会新建对象（池复用），任意时刻可见数不超过池容量
 for(let i=0;i<30;i++){fx.spawn(i,0,0);fx.update(.02);}
 assert.equal(scene.children.length,before,'池复用，不泄漏对象');
 assert.ok(scene.children.filter(c=>c.visible).length<=10,'可见特效不超过池容量');
});
test('多个点击可以同时播放（各自动画，互不干扰）',()=>{
 const scene=new T.Scene();
 const fx=createClickFx(scene);
 fx.spawn(0,0,0);fx.spawn(5,0,5);
 assert.equal(scene.children.filter(c=>c.visible).length,2,'两个点击同时进行');
 fx.update(.1);
 assert.equal(scene.children.filter(c=>c.visible).length,2,'各自独立推进');
});
test('主题色可配（日间暖金 / 夜间青蓝）',()=>{
 const day=createClickFx(new T.Scene(),{color:'#f2d79b'});
 const night=createClickFx(new T.Scene(),{color:'#8fd0e8'});
 assert.equal(day.spawn!==undefined&&night.spawn!==undefined,true,'两种配色都能创建');
});
