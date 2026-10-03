import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../src/world/engine.js';
import {createRain} from '../src/world/ambience.js';

test('setWeather only accepts rain and clear, and raining reflects it',()=>{
 const engine=new WorldEngine();
 assert.equal(engine.raining,false,'默认晴天');
 engine.setWeather('rain');
 assert.equal(engine.raining,true);
 assert.equal(engine.weather,'rain');
 engine.setWeather('clear');
 assert.equal(engine.raining,false);
 engine.setWeather('thunderstorm');
 assert.equal(engine.weather,'clear','未知天气退回晴天');
 assert.equal(engine.raining,false);
});

test('rain makes walking measurably slower',()=>{
 const dry=framesToArrive(new WorldEngine(),'clear');
 const wet=framesToArrive(new WorldEngine(),'rain');
 assert.ok(wet>dry*1.2,`雨天 ${wet} 帧应明显多于晴天的 ${dry} 帧`);
 assert.ok(wet<dry*2.2,'雨天不至于慢到停住');
});

test('agents linger longer at a destination in the rain',()=>{
 const dry=nextTripWait(new WorldEngine(),'clear');
 const wet=nextTripWait(new WorldEngine(),'rain');
 assert.ok(wet>dry*1.2,`雨天驻足 ${wet}s 应长于晴天的 ${dry}s`);
});

// 走到目的地需要多少帧：帧数越多说明走得越慢。
function framesToArrive(engine,weather){
 engine.setWeather(weather);
 engine.movePlayer(6,1);
 let guard=0;
 while(engine.player.path.length&&guard++<20000)engine.tick(.1);
 return guard;
}
// 等第一位侠客排定一次行程，记下它计划驻足多久。
function nextTripWait(engine,weather){
 engine.setWeather(weather);
 for(let i=0;i<20000;i++){
  engine.tick(.1);
  const going=engine.agents.find(a=>a.state.startsWith('前往')&&a.path.length===0&&a.wait>0);
  if(going)return going.wait;
 }
 throw new Error('没有抓到排程');
}

test('rain particles fall, and disappear again once the rain stops',()=>{
 const children=[];
 const scene={add(o){children.push(o);},remove(){}};
 const rain=createRain(scene,{count:40});
 assert.equal(rain.group.visible,false,'默认隐藏，不下雨时没有粒子');
 const drops=rain.group.children[0];
 assert.equal(drops.geometry.attributes.position.count,40);
 rain.start();
 assert.equal(rain.group.visible,true,'下雨时粒子可见');
 const before=[...drops.geometry.attributes.position.array];
 for(let i=0;i<10;i++)rain.update(.016);
 const after=drops.geometry.attributes.position.array;
 let moved=0;
 for(let i=1;i<before.length;i+=3)if(before[i]!==after[i])moved++;
 assert.ok(moved>30,'雨滴应持续下落');
 rain.stop();
 for(let i=0;i<200;i++)rain.update(.016);
 assert.equal(rain.group.visible,false,'停雨后淡出并隐藏');
 assert.equal(drops.material.opacity,0,'停雨后粒子透明度归零');
});
