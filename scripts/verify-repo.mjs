// 仓库完整性检查：面向"干净检出"的平台（Vercel/Netlify/Docker/CI），
// 构建所需文件必须都已进入 git——本地能跑不代表仓库完整。
// 曾因 .gitignore 的 `data/`（未锚定根）误伤 src/data/editions.json，
// 导致 Vercel 构建失败而本地毫无感知（2026-09-23）。
//
// 判定：工作区里属于构建范围的文件，必须"已被 git 跟踪"或"被 .gitignore 有意忽略"
// （后者需在白名单内，如根级 data/、dist/、artifacts/、node_modules/）。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// 构建范围：源码、服务端、静态资源、脚本、测试、文档与根级关键文件。
export const SCOPE_DIRS=['src','server','public','scripts','tests','docs'];
export const SCOPE_ROOT_FILES=['index.html','admin.html','vite.config.js','package.json','package-lock.json','vercel.json','Dockerfile','docker-compose.yml','.env.example','.nvmrc','.gitignore'];
// 允许被忽略的运行期产物（仅根级）；src/ 下的同名目录不在其列。
export const IGNORE_ALLOWLIST=['data','dist','artifacts','node_modules','.git'];

// 纯比较：返回"既未跟踪、也未被允许忽略"的文件列表（相对路径，正斜杠，NFC 归一化）。
// macOS 文件系统是 NFD、git 默认对非 ASCII 路径加引号转义，两侧都要归一化再比较。
export function findMissing(files,tracked,ignored){
 const trackedSet=new Set(tracked.map(f=>f.normalize('NFC')));
 const allowed=new Set(ignored.map(f=>{
  const first=f.split('/')[0];
  return IGNORE_ALLOWLIST.includes(first)?first:f;
 }));
 return files.map(f=>f.normalize('NFC')).filter(f=>{
  if(trackedSet.has(f))return false;
  const top=f.split('/')[0];
  if(pageIsIgnored(top,allowed))return false;
  return true;
 }).sort();
}
function pageIsIgnored(top,allowed){
 // 白名单按顶级名匹配：data/dist/artifacts/node_modules/.git 在任何深度都允许缺失于仓库，
 // 但 SCOPE_DIRS 内的文件即使叫 data 也不算（src/data 必须入库——正是当年的坑）。
 if(SCOPE_DIRS.includes(top))return false;
 return allowed.has(top);
}
function git(args){return execFileSync('git',['-c','core.quotePath=false',...args],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}
function walk(dir,base=''){
 const out=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.name==='.git'||entry.name==='node_modules')continue;
  const rel=base?`${base}/${entry.name}`:entry.name;
  if(entry.isDirectory())out.push(...walk(path.join(dir,entry.name),rel));
  else out.push(rel);
 }
 return out;
}
function main(){
 const root=path.resolve(import.meta.dirname,'..');
 const files=[];
 for(const dir of SCOPE_DIRS){
  const full=path.join(root,dir);
  if(fs.existsSync(full))files.push(...walk(full,dir));
 }
 for(const f of SCOPE_ROOT_FILES)if(fs.existsSync(path.join(root,f)))files.push(f);
 const tracked=git(['ls-files']).split('\n').filter(Boolean);
 const ignored=git(['status','--ignored','--porcelain']).split('\n')
  .filter(l=>l.startsWith('!! ')).map(l=>l.slice(3).replace(/\/$/,''));
 const missing=findMissing(files,tracked,ignored);
 if(missing.length){
  console.error('仓库完整性检查失败——以下构建所需文件未进入 git（干净检出会缺失，Vercel/Docker 构建将失败）：');
  for(const f of missing)console.error('  -',f);
  console.error('若是被 .gitignore 误伤，请把忽略规则锚定到根（如 /data/ 而非 data/），或 git add -A 后重新同步。');
  process.exit(1);
 }
 console.log(`仓库完整性 OK：构建范围 ${files.length} 个文件全部已入库（git 跟踪 ${tracked.length} 个）。`);
}
if(process.argv[1]&&process.argv[1].endsWith('verify-repo.mjs'))main();
