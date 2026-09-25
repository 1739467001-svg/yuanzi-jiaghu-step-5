import fs from 'node:fs';
const p='README.md';
let s=fs.readFileSync(p,'utf8');
const anchor="npm run validate:world` 与 `npm run validate:content` 通过。";
if(!s.includes(anchor))throw new Error('readme anchor not found');
// README 的验证段落若不存在该句则跳过（保持幂等）
console.log(s.includes(anchor)?'anchor found':'anchor missing');
