// 江湖氛围特效单测：招幡波动、远山分层。
// 花瓣/飞鸟/香烟/扬尘这类纯装饰件已从场景移除（画面太糊），这里不再覆盖。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({}),addEventListener(){}})};

const {createFlags,createMountains}=await import('../src/world/ambience.js');

test('招幡：旗面顶点在波动（有风）',()=>{
 const scene=new T.Scene();
 const flags=createFlags(scene,[{x:0,y:0,z:0,color:'#c85a4a',dir:1}]);
 const cloth=flags.group.children[1];
 const before=cloth.geometry.attributes.position.array.slice();
 flags.update(.016,500);
 const after=cloth.geometry.attributes.position.array;
 let moved=0;
 for(let i=0;i<after.length;i++)if(Math.abs(after[i]-before[i])>1e-6)moved++;
 assert.ok(moved>0,'旗面 z 在动（风吹）');
});
test('远山：三层剪影都在场景里',()=>{
 const scene=new T.Scene();
 const mountains=createMountains(scene,{grass:'#b9c8a3'});
 assert.equal(mountains.group.children.length,3,'三层山脊');
 assert.ok(mountains.group.children.every(l=>l.children.length>0),'每层都有山峰');
});
