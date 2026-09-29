// 原子门派建筑：Hall 式主楼 + 门派旗幡（不需要 placeholder 脚手架）
import fs from 'node:fs';
const p='src/world/models.js';
let s=fs.readFileSync(p,'utf8');
const from="  if(p.kind==='hall'||p.kind==='tea'){";
const to="  if(p.kind==='hall'||p.kind==='tea'||p.kind==='sect'){";
if(!s.includes(from))throw new Error('anchor not found');
s=s.replace(from,to);
// 门派旗幡：主楼两侧立旗，彰显"门派"身份
const anchor="  textSign(g,p.short,0,2.4,d/2+.25,Math.min(w*.6,3.6),.6);";
if(!s.includes(anchor))throw new Error('sign anchor not found');
const flag=`  if(p.kind==='sect'){
   // 门派旗幡：两杆高旗 + 旌旗布面，远处即可辨认为"门派"而非普通建筑。
   for(const sx of [-1,1]){cylinder(g,sx*(w/2+.55),2.1,d/2+.55,.045,.05,3.4,'#6d5943',8);box(g,sx*(w/2+.55),.15,d/2+.55,.34,.3,.34,'#a89a80');}
   box(g,-(w/2+1.05),2.55,d/2+.55,.75,1.5,.06,'#c85a4a');box(g,(w/2+1.05),2.55,d/2+.55,.75,1.5,.06,'#4a7a9e');
   ball(g,-(w/2+.55),3.9,d/2+.55,.12,'#d8b56a');ball(g,(w/2+.55),3.9,d/2+.55,.12,'#d8b56a');
  }
`;
s=s.replace(anchor,anchor+'\n'+flag.trimStart());
fs.writeFileSync(p,s);
console.log('sect building model added');
