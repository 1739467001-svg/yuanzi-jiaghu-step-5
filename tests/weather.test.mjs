import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../src/world/engine.js';
import {createRain,createMist} from '../src/world/ambience.js';

test('setWeather accepts rain, nightRain and fog; unknown falls back to clear',()=>{
 const engine=new WorldEngine();
 assert.equal(engine.raining,false,'默认晴天');
 assert.equal(engine.foggy,false,'默认无雾');
 engine.setWeather('rain');
 assert.equal(engine.raining,true);
 assert.equal(engine.weather,'rain');
 engine.setWeather('nightRain');
 assert.equal(engine.raining,true,'夜雨也是雨（水面涟漪、湿天色都走雨的通道）');
 assert.equal(engine.foggy,false);
 engine.setWeather('fog');
 assert.equal(engine.foggy,true);
 assert.equal(engine.raining,false,'雾不是雨');
 engine.setWeather('clear');
 assert.equal(engine.raining,false);
 assert.equal(engine.foggy,false);
 engine.setWeather('thunderstorm');
 assert.equal(engine.weather,'clear','未知天气退回晴天');
});

test('rain makes walking measurably slower',()=>{
 const dry=framesToArrive(new WorldEngine(),'clear');
 const wet=framesToArrive(new WorldEngine(),'rain');
 assert.ok(wet>dry*1.2,`雨天 ${wet} 帧应明显多于晴天的 ${dry} 帧`);
 assert.ok(wet<dry*2.2,'雨天不至于慢到停住');
});

test('fog slows walking, but less than rain',()=>{
 // 帧计数按「每段路径取整」量化，晴与雾会落进同一档；改用固定时间内走过的距离度量。
 const dry=distanceInTicks(new WorldEngine(),'clear');
 const wet=distanceInTicks(new WorldEngine(),'rain');
 const fog=distanceInTicks(new WorldEngine(),'fog');
 assert.ok(fog<dry,`雾天 ${fog.toFixed(2)} 格应少于晴天的 ${dry.toFixed(2)} 格`);
 assert.ok(fog>wet,`雾天不应比雨天更慢（${fog.toFixed(2)} > ${wet.toFixed(2)}）`);
});

test('agents linger longer at a destination in the rain',()=>{
 const dry=nextTripWait(new WorldEngine(),'clear');
 const wet=nextTripWait(new WorldEngine(),'rain');
 assert.ok(wet>dry*1.2,`雨天驻足 ${wet}s 应长于晴天的 ${dry}s`);
});

test('agents linger a bit longer in fog than in clear weather',()=>{
 const dry=nextTripWait(new WorldEngine(),'clear');
 const fog=nextTripWait(new WorldEngine(),'fog');
 assert.ok(fog>dry*1.05,`雾天驻足 ${fog}s 应略长于晴天的 ${dry}s`);
});

// 走到目的地需要多少帧：帧数越多说明走得越慢。
function framesToArrive(engine,weather){
 engine.setWeather(weather);
 engine.movePlayer(6,1);
 let guard=0;
 while(engine.player.path.length&&guard++<20000)engine.tick(.1);
 return guard;
}
// 固定帧数内从出生点走过的直线距离：距离越短说明走得越慢。
// 取 10 帧（1 秒）——路程是 1 单位一段的网格，4 的倍数帧会落在节点上，
// 晴（3.2）与雾（2.6）每段都取整成 4 帧，只有段中位置能区分。
function distanceInTicks(engine,weather,ticks=10){
 engine.setWeather(weather);
 engine.movePlayer(6,1);
 for(let i=0;i<ticks;i++)engine.tick(.1);
 return Math.hypot(engine.player.x+3,engine.player.z-1);
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

test('night rain switches the rain and wet-patch tones',()=>{
 const children=[];
 const scene={add(o){children.push(o);},remove(){}};
 const rain=createRain(scene,{count:20,night:false});
 const drops=rain.group.children[0],wet=rain.group.children[1];
 assert.equal(drops.material.color.getHexString(),'cfe0e8','白天基调');
 assert.equal(wet.material.color.getHexString(),'7f9099');
 rain.setTone(true);
 assert.equal(drops.material.color.getHexString(),'8fb0c8','夜雨：雨丝压暗');
 assert.equal(wet.material.color.getHexString(),'16232b','夜雨：湿斑压暗');
 rain.setTone(false);
 assert.equal(drops.material.color.getHexString(),'cfe0e8','切回白天基调');
});

test('mist bands drift while foggy and hide after it lifts',()=>{
 const children=[];
 const scene={add(o){children.push(o);},remove(){}};
 const mist=createMist(scene,{count:5});
 assert.equal(mist.group.visible,false,'默认隐藏，无雾时没有雾带');
 assert.equal(mist.group.children.length,5);
 assert.ok(mist.group.children.every(b=>b.material.opacity===0),'起步全透明');
 mist.start();
 assert.equal(mist.group.visible,true,'起雾后雾带可见');
 const band=mist.group.children[0];
 const before={x:band.position.x,y:band.position.y};
 for(let i=0;i<60;i++)mist.update(.016);
 assert.notEqual(band.position.x,before.x,'雾带持续漂移');
 assert.notEqual(band.position.y,before.y,'雾带缓慢起伏');
 assert.ok(band.material.opacity>0,'雾带渐显');
 mist.stop();
 for(let i=0;i<400;i++)mist.update(.016);
 assert.equal(mist.group.visible,false,'雾散后淡出并隐藏');
 assert.ok(mist.group.children.every(b=>b.material.opacity<.005),'雾带透明度归零');
});
