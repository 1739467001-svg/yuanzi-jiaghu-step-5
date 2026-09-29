import fs from 'node:fs';
const p='tests/sects.test.mjs';
const lines=fs.readFileSync(p,'utf8').split('\n');
// 1) 第 49 行是被误改的（权限测试里只应验证 outsider 抛错），恢复删除
if(lines[48]&&lines[48].includes("removeMember(sect.id,'m-阿原'")){
 lines.splice(48,1);
 console.log('removed stray line 49');
}
// 2) 找到真正的 removeMember 调用行（在"移出成员"注释之后）
const idx=lines.findIndex(l=>l.includes("removeMember(sect.id,'阿原')"));
if(idx<0)throw new Error('real removeMember line not found');
lines[idx]="  const removed=removeMember(sect.id,'m-阿原',founder); // 长老 userId 由名字派生";
if(lines[idx+1]&&lines[idx+1].includes('elders.length,0'))lines[idx+1]="  assert.equal(removed.elders.length,0,'长老被移出');";
if(lines[idx+2]&&lines[idx+2].includes('disciples.length,2'))lines[idx+2]="  assert.equal(removed.disciples.length,2,'两名弟子保留');";
fs.writeFileSync(p,lines.join('\n'));
console.log('fixed real line',idx+1);
