import fs from 'node:fs';
const p='scripts/smoke-multiplayer.mjs';
let s=fs.readFileSync(p,'utf8');
const blockStart=s.indexOf(" // 6.5 AI 见闻名帖卡");
if(blockStart<0)throw new Error('block not found');
const blockEnd=s.indexOf("\n",s.indexOf("}",blockStart));
// 找到 6.5 块的结束（下一个注释行前）
const nextComment=s.indexOf(" // 7. 同账号",blockStart);
if(nextComment<0)throw new Error('next section not found');
const block=s.slice(blockStart,nextComment).trim();
s=s.slice(0,blockStart)+s.slice(nextComment);
// 插到「离开会话」之后（AI 私聊段的离开会话）
const leaveAnchor="await a.getByRole('button',{name:'离开会话'}).click();\n  // 7. 同账号第二个标签页接管";
if(!s.includes(leaveAnchor))throw new Error('leave anchor not found');
s=s.replace(leaveAnchor,"await a.getByRole('button',{name:'离开会话'}).click();\n  "+block+"\n  // 7. 同账号第二个标签页接管");
fs.writeFileSync(p,s);
console.log('6.5 moved after leaving session');
