// 展厅 AI 行为（纯逻辑，无 Three 依赖）：选展位 → 行走 → 驻足观展 → 下一个。
// 与小镇状态机相互独立：展厅侧只驱动展示层，不双控小镇引擎。
import {findPath,hallWalkable,stepActor} from './engine.js';

const HALL_SPAWNS=[[0,6.5],[-4,6.5],[4,6.5],[-8,5],[8,5],[-6,1],[6,1],[0,1.5]];
// stands: [{id,title,x,z}]；agents: [{id,name}]
export function createHallAgents(stands,agents){
 return agents.map((a,i)=>({
  id:a.id,name:a.name,
  x:HALL_SPAWNS[i%HALL_SPAWNS.length][0],z:HALL_SPAWNS[i%HALL_SPAWNS.length][1],
  angle:0,path:[],state:'观展中',wait:1+i*.8,stand:null,lastStand:null,arrived:false,
 }));
}
export function stepHallAgent(ha,stands,dt){
 if(ha.path.length){ha.state='前往观展';return;}
 if(ha.stand){
  // 刚到展位前重置驻足时间；随后面向展板倒计时。
  if(!ha.arrived){ha.arrived=true;ha.wait=8+((ha.x+ha.z)%9);}
  ha.angle=Math.atan2(ha.stand.x-ha.x,ha.stand.z-ha.z);
  ha.state='观展中';
  ha.wait-=dt;
  if(ha.wait<=0){ha.stand=null;ha.arrived=false;}
  return;
 }
 ha.state='歇脚中';
 ha.wait-=dt;
 if(ha.wait<=0){
  const from=stands.indexOf(ha.lastStand);
  const stand=stands[(from+1+Math.floor(ha.x+ha.z))%stands.length]||stands[0];
  ha.lastStand=stand;
  const route=findPath([ha.x,ha.z],[stand.x,stand.z+1.9],hallWalkable);
  if(route.length){ha.path=route;ha.stand=stand;ha.arrived=false;ha.state='前往观展';}
  ha.wait=2;
 }
}
// 推进一个展厅侠客（行走 + 行为决策）。
export function advanceHallAgent(ha,stands,dt){
 stepActor(ha,dt,1.05);
 stepHallAgent(ha,stands,dt);
}
// 驻足时的书名气泡文案。
export function hallAgentLabel(ha){
 if(ha.state!=='观展中'||!ha.stand)return '';
 return '观展：《'+(ha.stand.title.length>6?ha.stand.title.slice(0,6)+'…':ha.stand.title)+'》';
}
