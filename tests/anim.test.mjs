// 角色转身与动画单测：重点守住「GLB 角色也必须转身」这个回归
// （早期实现把转身放在 userData.body 判断之后，接入 GLB 的角色只会平移——横着走）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {animateCharacter} from '../src/world/anim.js';
import {character} from '../src/world/models.js';

const settle=(model,target,frames=60)=>{for(let i=0;i<frames;i++)animateCharacter(model,target,true,i*16.7,false);};
// 角度比较要考虑 ±π 等价
const sameAngle=(a,b)=>Math.abs(((a-b+Math.PI*3)%(Math.PI*2))-Math.PI)<.05;

test('GLB 角色（没有 userData.body）也会转向移动方向',()=>{
 const model=new T.Group();      // GLB 实例没有任何程序化部件
 assert.equal(model.userData.body,undefined);
 const target=Math.atan2(1,1);
 settle(model,target);
 assert.ok(sameAngle(model.rotation.y,target),'转身收敛到目标角度（当前 '+model.rotation.y.toFixed(3)+'）');
 // 点击另一个方向：按最短弧线转过去，不会绕远
 const second=Math.atan2(-1,0);
 settle(model,second,120);
 assert.ok(sameAngle(model.rotation.y,second),'换方向后继续转向');
});
test('转身是渐进的：首次出现直接面向出生方向，之后逐帧插值',()=>{
 const model=new T.Group();
 animateCharacter(model,Math.PI,false,0,false);
 assert.ok(sameAngle(model.rotation.y,Math.PI),'首次出现即面向出生方向（不突兀）');
 // 已经在某个朝向后，换方向是渐进的：一帧只转一小步
 const after=model.rotation.y;
 animateCharacter(model,Math.PI/2,false,16.7,false);
 assert.ok(Math.abs(model.rotation.y-after)>.01,'第二帧开始转动');
 assert.ok(Math.abs(model.rotation.y-Math.PI/2)>.3,'但不会一帧跳到位');
 settle(model,Math.PI/2);
 assert.ok(sameAngle(model.rotation.y,Math.PI/2),'多帧后转到目标');
});
test('程序化角色：转身 + 行走身体动画 + 静止呼吸',()=>{
 const model=character('#427ab5');
 assert.ok(model.userData.body,'程序化角色有身体');
 const target=Math.PI/2;
 settle(model,target);
 assert.ok(sameAngle(model.rotation.y,target),'程序化角色同样转向');
 assert.ok(model.userData.body.position.y>0,'行走时身体有起伏');
 assert.ok(model.userData.feet[0].position.z!==0,'行走时脚步交替');
 // 静止：呼吸起伏，侧倾收敛
 for(let i=0;i<80;i++)animateCharacter(model,target,false,i*16.7,false);
 assert.ok(model.userData.body.rotation.z<.02,'静止后侧倾收敛');
 assert.ok(model.userData.body.position.y>0,'静止时仍有呼吸起伏');
});
test('点击方向决定脸的朝向：位移方向即 atan2(dx,dz)',()=>{
 const model=new T.Group();
 for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1],[1,1]]){
  settle(model,Math.atan2(dx,dz));
  assert.ok(sameAngle(model.rotation.y,Math.atan2(dx,dz)),`朝向 (${dx},${dz}) 正确`);
 }
});
