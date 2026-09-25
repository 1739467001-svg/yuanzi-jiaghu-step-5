// 一次性脚本：把 6.5 见闻检查块移到「离开会话」之后（原位置被聊天浮层挡住点击）
import fs from 'node:fs';
const p='scripts/smoke-multiplayer.mjs';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf(' // 6.5 AI 见闻名帖卡');
const endMark=' // 7. 同账号第二个标签页接管';
const end=s.indexOf(endMark);
if(start<0||end<0||end<=start)throw new Error('anchors not found');
const block=s.slice(start,end).trim();
s=s.slice(0,start)+s.slice(end);
const leaveAnchor="  await a.getByRole('button',{name:'离开会话'}).click();\n"+endMark;
if(!s.includes(leaveAnchor))throw new Error('leave anchor not found: '+JSON.stringify(leaveAnchor.slice(0,60)));
s=s.replace(leaveAnchor,"  await a.getByRole('button',{name:'离开会话'}).click();\n  "+block+"\n"+endMark);
fs.writeFileSync(p,s);
console.log('6.5 moved after leaving the AI session');
