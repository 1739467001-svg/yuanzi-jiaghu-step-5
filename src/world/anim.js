// 角色程序化动画：行走时身体侧倾、手臂摆动、脚步交替；静止时呼吸起伏。
// angleSmooth 保存每个模型上一次的朝向，用于转身插值（避免瞬间跳变）。
const angleMemory=new WeakMap();
export function animateCharacter(model,angle,moving,now,held){
 const body=model.userData.body;if(!body)return;
 // 转身插值：按最短弧线逼近目标角度，产生惯性感。
 const prev=angleMemory.get(model);
 let a=prev===undefined?angle:prev;
 let delta=((angle-a+Math.PI*3)%(Math.PI*2))-Math.PI;
 a+=delta*Math.min(1,.18);
 angleMemory.set(model,a);
 model.rotation.y=a;
 if(moving){
  const t=now*.009;
  body.position.y=Math.abs(Math.sin(t))*.055;
  body.rotation.z=Math.sin(t)*.045;          // 侧倾：重心随步伐左右转移
  body.rotation.x=.03;                        // 前行微俯
  const sw=Math.sin(now*.01);
  model.userData.feet?.forEach((f,i)=>{f.position.z=.04+(i?sw:-sw)*.13;});
  model.userData.arms?.forEach((arm,i)=>{arm.rotation.x=(i?1:-1)*sw*.55;arm.rotation.z=0;});
 }else{
  body.position.y=Math.sin(now*.002+model.position.x)*.016;  // 呼吸
  body.rotation.z*=.9;body.rotation.x*=.9;
  model.userData.feet?.forEach(f=>{f.position.z*=.9;});
  model.userData.arms?.forEach(arm=>{arm.rotation.x*=.85;});
 }
 if(held)model.userData.arms?.[0]&&(model.userData.arms[0].rotation.z=Math.sin(now*.004)*.4);
}
