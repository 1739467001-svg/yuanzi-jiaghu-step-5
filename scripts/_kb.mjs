// 键盘行走：WASD/方向键 → 向该方向发送服务端 move（与点击行走同一通道）
import fs from 'node:fs';
const p='src/world/OnlineWorld.jsx';
let s=fs.readFileSync(p,'utf8');
const edits=[
 // 1) 键盘状态与处理函数（挂在 renderer 容器旁，随卸载清理）
 ["  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);",
  `  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  // 键盘行走：WASD/方向键按住即向该方向行走（与服务端点击行走同一 move 通道）。
  const keys=new Set();
  const keyDir=()=>{
   let dx=0,dz=0;
   if(keys.has('KeyW')||keys.has('ArrowUp'))dz-=1;
   if(keys.has('KeyS')||keys.has('ArrowDown'))dz+=1;
   if(keys.has('KeyA')||keys.has('ArrowLeft'))dx-=1;
   if(keys.has('KeyD')||keys.has('ArrowRight'))dx+=1;
   if(dx&&dz){const inv=1/Math.hypot(dx,dz);dx*=inv;dz*=inv;}
   return [dx,dz];
  };
  const keyMove=()=>{
   const [dx,dz]=keyDir();
   if(!dx&&!dz)return;
   const self=selfRef.current;
   const tx=Math.round(self.x+dx*2.6),tz=Math.round(self.z+dz*2.6);
   if(!walkable(tx,tz))return;
   self.path=findPath([self.x,self.z],[tx,tz]);self.state='正在前往';
   client?.move(tx,tz);
  };
  const onKeyDown=e=>{
   if(e.target&&/input|textarea|select/i.test(e.target.tagName))return;
   if(document.querySelector('.dialog-shade'))return;   // 对话框打开时不劫持键盘
   if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
    if(!keys.has(e.code))keyMove();
    keys.add(e.code);e.preventDefault();
   }
  };
  const onKeyUp=e=>keys.delete(e.code);
  window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
  const keyTimer=setInterval(()=>{if(keys.size)keyMove();},320);`],
 // 2) 卸载清理
 ["  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();",
  "  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);clearInterval(keyTimer);controls.dispose();"],
];
for(const [from,to] of edits){
 if(!s.includes(from))throw new Error('anchor not found: '+from.slice(0,60));
 s=s.replace(from,to);
}
fs.writeFileSync(p,s);
console.log('keyboard movement wired');
