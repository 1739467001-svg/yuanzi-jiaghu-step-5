// 同步当前工作区到 GitHub（经 Git Data API）。
// 背景：本机到 github.com:443 的 git 协议连接持续被网络干扰，而 api.github.com 稳定；
// 该脚本把"提交 + 推送"合并为一次 API 快照提交，之后的每次更新都用它同步。
// 用法：node scripts/git-sync.mjs "提交信息"（不传则自动生成）
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const REPO=process.env.GH_REPO||'1739467001-svg/yuanzi-jiaghu-step-5';
const BRANCH=process.env.GH_BRANCH||'main';
const message=process.argv.slice(2).join(' ')||`chore: 同步更新 ${new Date().toISOString().slice(0,16)}`;

const token=(process.env.GH_TOKEN||execFileSync('gh',['auth','token'],{encoding:'utf8'})).trim();
if(!token)throw new Error('未获取到 GitHub 令牌（gh auth token 或 GH_TOKEN）');

async function api(path,{method='GET',body}={},attempt=0){
 let r;
 try{
  r=await fetch(`https://api.github.com/repos/${REPO}${path}`,{
   method,
   headers:{'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body),
   // 本机到 api.github.com 的连接时快时慢（曾卡在默认 10s 连接超时边缘）：放宽并重试。
   signal:AbortSignal.timeout(60000),
  });
 }catch(error){
  if(attempt<4){
   const wait=3*2**attempt*1000;
   console.warn(`网络错误（${error.cause?.code||error.message}），${wait/1000}s 后重试（第 ${attempt+1} 次）`);
   await new Promise(s=>setTimeout(s,wait));
   return api(path,{method,body},attempt+1);
  }
  throw error;
 }
 const text=await r.text();
 // 次级限流/服务端抖动：退避重试（GitHub 要求"等几分钟"，这里指数退避最多约 7 分钟）。
 if(!r.ok&&(r.status===403||r.status===429||r.status>=500)&&attempt<6){
  const wait=Math.min(20*2**attempt,240)*1000;
  console.warn(`API ${method} ${path} -> ${r.status}，${wait/1000}s 后重试（第 ${attempt+1} 次）`);
  await new Promise(s=>setTimeout(s,wait));
  return api(path,{method,body},attempt+1);
 }
 if(!r.ok)throw new Error(`API ${method} ${path} -> ${r.status}: ${text.slice(0,300)}`);
 return text?JSON.parse(text):null;
}

// 1. 本地暂存并提交（保留本地历史，便于回看与恢复）。
execFileSync('git',['add','-A'],{stdio:'inherit'});
const dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
if(dirty){execFileSync('git',['commit','-m',message],{stdio:'inherit'});console.log(`本地提交：${message}`);}
else console.log('本地无改动，仅同步远端');

// 2. 索引中的完整文件清单（mode/sha/path）——blob SHA 与本地 git 一致，可做增量比对。
// core.quotePath=false：中文文件名不被转义加引号。
const files=execFileSync('git',['-c','core.quotePath=false','ls-files','-s'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(l=>{
 const m=/^(\d+) ([0-9a-f]{40}) \d+\t(.*)$/.exec(l);
 if(!m)throw new Error(`无法解析 ls-files 行：${l}`);
 return {mode:m[1],sha:m[2],path:m[3]};
});

// 3. 远端当前树（仓库为空时从零开始）。
let remoteSha=null;
const remoteFiles=new Map();
try{
 const ref=await api(`/git/ref/heads/${BRANCH}`);
 remoteSha=ref.object.sha;
 const commit=await api(`/git/commits/${remoteSha}`);
 const tree=await api(`/git/trees/${commit.tree.sha}?recursive=1`);
 for(const t of tree.tree)if(t.type==='blob')remoteFiles.set(t.path,t.sha);
}catch(e){if(!/ (404|409):/.test(e.message))throw e;}

// 4. 只上传缺失或内容变化的 blob（并发 3，避免次级限流；已传过的 SHA 本地缓存复用）。
const cachePath='.git/api-blob-cache.json';
let uploadedBefore=new Set();
try{uploadedBefore=new Set(JSON.parse(fs.readFileSync(cachePath,'utf8')));}catch{}
const pending=files.filter(f=>remoteFiles.get(f.path)!==f.sha&&!uploadedBefore.has(f.sha));
let done=0;
async function upload(f){
 const blob=await api('/git/blobs',{method:'POST',body:{content:fs.readFileSync(f.path).toString('base64'),encoding:'base64'}});
 if(blob.sha!==f.sha)throw new Error(`blob SHA 不一致：${f.path}（本地 ${f.sha} / 远端 ${blob.sha}）`);
 uploadedBefore.add(f.sha);
 fs.writeFileSync(cachePath,JSON.stringify([...uploadedBefore]));
 done++;if(done%25===0||done===pending.length)console.log(`已上传 ${done}/${pending.length}`);
}
const workers=Array.from({length:Math.min(3,pending.length)},async()=>{while(pending.length)await upload(pending.shift());});
await Promise.all(workers);

// 5. 全量建树 → 建提交（父提交为远端当前提交）→ 创建或更新引用。
// 变化检测要双向：本地有而远端不同（新增/修改）+ 远端有而本地已删除（删除也要同步）。
const localPaths=new Set(files.map(f=>f.path));
const treeChanged=files.some(f=>remoteFiles.get(f.path)!==f.sha)||[...remoteFiles.keys()].some(p=>!localPaths.has(p));
if(!treeChanged&&remoteSha){console.log('远端已是最新，无需新提交');process.exit(0);}
const tree=await api('/git/trees',{method:'POST',body:{tree:files.map(f=>({path:f.path,mode:f.mode,type:'blob',sha:f.sha}))}});
const commit=await api('/git/commits',{method:'POST',body:{message,tree:tree.sha,parents:remoteSha?[remoteSha]:[]}});
if(remoteSha)await api(`/git/refs/heads/${BRANCH}`,{method:'PATCH',body:{sha:commit.sha}});
else await api('/git/refs',{method:'POST',body:{ref:`refs/heads/${BRANCH}`,sha:commit.sha}});
console.log(`已同步到 GitHub：${REPO}@${BRANCH} ${commit.sha.slice(0,7)}（${files.length} 个文件，上传 ${done} 个）`);
