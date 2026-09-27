import fs from 'node:fs';
// World.jsx：本地小镇 + 展厅的角色动画改用共享 animateCharacter
let s=fs.readFileSync('src/world/World.jsx','utf8');
const edits=[
 // import
 ["import {box,ball,cylinder,mesh,dmesh,material,building,tree,character,bridge,atomSculpture,textSign,lantern} from './models.js';",
  "import {box,ball,cylinder,mesh,dmesh,material,building,tree,character,bridge,atomSculpture,textSign,lantern} from './models.js';\nimport {animateCharacter} from './anim.js';"],
 // 小镇：位置交给 animateCharacter（含转身插值），不再直接 setRotation
 ["for(const a of [...engine.agents,engine.player]){const m=a.id==='you'?player:agentModels.get(a.id);m.position.set(a.x,terrainHeight(a.x,a.z),a.z);m.rotation.y=a.angle;const moving=a.path.length>0;",
  "for(const a of [...engine.agents,engine.player]){const m=a.id==='you'?player:agentModels.get(a.id);m.position.set(a.x,terrainHeight(a.x,a.z),a.z);const moving=a.path.length>0;animateCharacter(m,a.angle,moving,now,a.held);"],
 // 移除旧的内联动画（保留 GLB 分支）
 ["     if(m.userData.body){m.userData.body.position.y=moving?Math.abs(Math.sin(now*.009))* .055:Math.sin(now*.002+a.x)*.016;m.userData.feet.forEach((f,i)=>f.position.z=.04+(moving?Math.sin(now*.01+i*Math.PI)*.13:0));if(a.held)m.userData.arms[0].rotation.z=Math.sin(now*.004)*.4;}\n     else if(m.userData.glb){",
  "     if(m.userData.glb){"],
 // 展厅 AI 同样使用
 ["     if(ha.model.userData.body){ha.model.userData.body.position.y=ha.path.length?Math.abs(Math.sin(now*.009))* .055:Math.sin(now*.002+ha.x)*.016;ha.model.userData.feet.forEach((f,i)=>f.position.z=.04+(ha.path.length?Math.sin(now*.01+i*Math.PI)*.13:0));}\n     else if(ha.model.userData.glb){",
  "     if(ha.model.userData.glb){"],
];
for(const [from,to] of edits){
 if(!s.includes(from))throw new Error('anchor not found: '+from.slice(0,60));
 s=s.replace(from,to);
}
// 展厅 AI：在 userData.glb 分支前调用 animateCharacter
const hallAnchor="     if(ha.model.userData.glb){";
if(!s.includes(hallAnchor))throw new Error('hall anchor not found');
s=s.replace(hallAnchor,"     animateCharacter(ha.model,ha.angle,ha.path.length>0,now,false);\n"+hallAnchor);
fs.writeFileSync('src/world/World.jsx',s);
console.log('World.jsx animation wired');
