import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 预算账本写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-budget-'));
process.env.ATOM_DATA_DIR=tmp;
const {gate,reserve,settle,budgetConfig,estimateCost,dayUsage,ledgerSummary} = await import('../server/budget.mjs');

const env={ATOM_DAILY_BUDGET:'1',ATOM_DAILY_CALL_LIMIT:'100',ATOM_MAX_CONCURRENT:'2',ATOM_PRICE_IN_PER_MTOK:'2',ATOM_PRICE_OUT_PER_MTOK:'4'};

test('reserve and settle record usage with requestId deduplication', () => {
 const r=reserve('req-1',{in:1000,out:0},env);
 assert.ok(r.ok);
 assert.equal(dayUsage().calls,0,'预留不计调用次数');
 const s=settle('req-1',{model:'m',tokens:{in:1000,out:500},status:'ok'},env);
 assert.equal(s.record.status,'ok');
 // 1000 in * 2/M + 500 out * 4/M = 0.002 + 0.002 = 0.004
 assert.equal(dayUsage().cost,0.004);
 assert.equal(dayUsage().calls,1);
 // 重复结算被忽略；重复预留不重复计费。
 const again=settle('req-1',{model:'m',tokens:{in:9999,out:9999},status:'ok'},env);
 assert.equal(again.duplicate,true);
 assert.equal(dayUsage().cost,0.004);
 const dup=reserve('req-1',{in:1000,out:0},env);
 assert.equal(dup.duplicate,true);
 assert.equal(dayUsage().cost,0.004);
 // 失败请求记录状态但不计入调用次数。
 reserve('req-2',{in:100,out:0},env);
 settle('req-2',{model:'m',tokens:{in:0,out:0},status:'error'},env);
 assert.equal(dayUsage().calls,1);
});

test('gate warns at 80% and stops at 100% of the daily budget', () => {
 // 账本已用 0.004 / 预算 1：ok。
 assert.equal(gate(env).level,'ok');
 // 直接写入 0.8（80%）。
 const ledger={requests:{},days:{[new Date().toISOString().slice(0,10)]:{cost:0.8,calls:1}}};
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify(ledger));
 assert.equal(gate(env).level,'warn');
 // 达到 1.0：stop，且 reserve 拒绝。
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify({requests:{},days:{[new Date().toISOString().slice(0,10)]:{cost:1,calls:9}}}));
 const stopped=gate(env);
 assert.equal(stopped.level,'stop');
 assert.equal(stopped.reason,'daily-budget');
 assert.equal(reserve('req-3',{in:10,out:0},env).ok,false,'硬上限后不再预留');
 // 次数上限同样硬停。
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify({requests:{},days:{[new Date().toISOString().slice(0,10)]:{cost:0,calls:100}}}));
 assert.equal(gate(env).reason,'daily-call-limit');
});

test('ledger survives a restart and concurrency is bounded', () => {
 // 模拟重启：重新读取同一文件（模块内 active 计数归零，但费用保留）。
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify({requests:{'req-x':{requestId:'req-x',status:'ok',cost:0.5}},days:{[new Date().toISOString().slice(0,10)]:{cost:0.5,calls:5}}}));
 const summary=ledgerSummary(env);
 assert.equal(summary.usage.cost,0.5);
 assert.equal(summary.usage.calls,5);
 assert.equal(summary.active,0,'重启后并发计数归零，费用不清零');
 // 并发上限 2：第三个预留被拒绝。
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify({requests:{},days:{}}));
 assert.ok(reserve('c-1',{in:1,out:0},env).ok);
 assert.ok(reserve('c-2',{in:1,out:0},env).ok);
 assert.equal(reserve('c-3',{in:1,out:0},env).reason,'concurrency');
 settle('c-1',{tokens:{in:0,out:0},status:'ok'},env);
 assert.ok(reserve('c-4',{in:1,out:0},env).ok,'结算后释放并发位');
});

test('estimateCost follows configured per-million-token prices', () => {
 const config=budgetConfig(env);
 assert.equal(estimateCost({in:1e6,out:0},config),2);
 assert.equal(estimateCost({in:0,out:1e6},config),4);
 assert.equal(estimateCost({in:0,out:0},budgetConfig({})),0,'未配置价格时只记录 token');
});
