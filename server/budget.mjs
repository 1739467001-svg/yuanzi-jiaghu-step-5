// 持久预算账本（本地演示）：模型调用按 requestId 去重；并发先预留后结算；
// 每日预算达到 80% 进入 warn（后台 AI 活动应降级），达到 100% 或超过次数/并发上限进入 stop。
// 服务重启不清空费用：账本落盘在 data/usage-ledger.json，进程内只保存并发计数。
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const ledgerFile=()=>path.join(dataDir(),'usage-ledger.json');
const today=()=>new Date().toISOString().slice(0,10);

function readLedger(){
 try{const ledger=JSON.parse(fs.readFileSync(ledgerFile(),'utf8'));if(ledger&&typeof ledger==='object')return {requests:ledger.requests||{},days:ledger.days||{}};}catch{}
 return {requests:{},days:{}};
}
function writeLedger(ledger){
 const file=ledgerFile();
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(ledger,null,2));
 fs.renameSync(tmp,file);
}
export function budgetConfig(env={}){
 return {
  dailyBudget:Math.max(0,Number(env.ATOM_DAILY_BUDGET)||0),
  dailyCallLimit:Math.max(0,Number(env.ATOM_DAILY_CALL_LIMIT)||0),
  maxConcurrent:Math.max(1,Number(env.ATOM_MAX_CONCURRENT)||3),
  priceInPerMtok:Math.max(0,Number(env.ATOM_PRICE_IN_PER_MTOK)||0),
  priceOutPerMtok:Math.max(0,Number(env.ATOM_PRICE_OUT_PER_MTOK)||0),
 };
}
export function estimateCost(tokens,config){
 const input=Number(tokens?.in)||0,output=Number(tokens?.out)||0;
 return input/1e6*config.priceInPerMtok+output/1e6*config.priceOutPerMtok;
}
export function dayUsage(){
 const ledger=readLedger();
 return ledger.days[today()]||{cost:0,calls:0};
}
// 门：ok / warn（达到 80%）/ stop（达到 100%、超过次数上限）。并发上限由 reserve 控制。
export function gate(env={}){
 const config=budgetConfig(env);
 const usage=dayUsage();
 const base={...usage,config};
 if(config.dailyBudget>0&&usage.cost>=config.dailyBudget)return {level:'stop',reason:'daily-budget',...base};
 if(config.dailyCallLimit>0&&usage.calls>=config.dailyCallLimit)return {level:'stop',reason:'daily-call-limit',...base};
 if(config.dailyBudget>0&&usage.cost>=config.dailyBudget*.8)return {level:'warn',reason:'daily-budget-80',...base};
 return {level:'ok',...base};
}
let active=0;
// 预留：并发位 + 估算费用。已结算过的 requestId 不重复计费。
export function reserve(requestId,estimatedTokens,env={}){
 const config=budgetConfig(env);
 const ledger=readLedger();
 if(ledger.requests[requestId])return {ok:true,duplicate:true,record:ledger.requests[requestId]};
 if(active>=config.maxConcurrent)return {ok:false,reason:'concurrency'};
 const status=gate(env);
 if(status.level==='stop')return {ok:false,reason:status.reason};
 active++;
 const cost=estimateCost(estimatedTokens,config);
 const day=ledger.days[today()]||{cost:0,calls:0};
 day.cost=Math.round((day.cost+cost)*1e6)/1e6;
 ledger.days[today()]=day;
 ledger.requests[requestId]={requestId,status:'reserved',tokens:{in:Number(estimatedTokens?.in)||0,out:Number(estimatedTokens?.out)||0},cost,model:null,time:new Date().toISOString()};
 writeLedger(ledger);
 return {ok:true,reservation:ledger.requests[requestId]};
}
// 结算：按实际用量修正（含模型失败记录）；重复结算忽略。
export function settle(requestId,{model=null,tokens={in:0,out:0},status='ok'}={},env={}){
 const config=budgetConfig(env);
 const ledger=readLedger();
 const record=ledger.requests[requestId];
 if(!record||record.status!=='reserved')return {duplicate:true,record:record||null};
 const actualCost=estimateCost(tokens,config);
 const day=ledger.days[today()]||{cost:0,calls:0};
 day.cost=Math.max(0,Math.round((day.cost-record.cost+actualCost)*1e6)/1e6);
 if(status==='ok')day.calls=(day.calls||0)+1;
 ledger.days[today()]=day;
 record.status=status;record.model=model;record.tokens={in:Number(tokens.in)||0,out:Number(tokens.out)||0};record.cost=actualCost;record.settledAt=new Date().toISOString();
 writeLedger(ledger);
 active=Math.max(0,active-1);
 return {record};
}
export function activeCount(){return active;}
export function ledgerSummary(env={}){
 return {today:today(),usage:dayUsage(),config:budgetConfig(env),active,level:gate(env).level};
}
