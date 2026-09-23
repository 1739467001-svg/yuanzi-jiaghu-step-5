import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-brain-'));
process.env.ATOM_DATA_DIR=tmp;
const {generateAgentReply} = await import('../server/agent-brain.mjs');

const modelEnv={ATOM_LLM_API_KEY:'test-key',ATOM_LLM_BASE_URL:'http://mock.local/v1',ATOM_LLM_MODEL:'test-model',ATOM_DAILY_BUDGET:'0',ATOM_DAILY_CALL_LIMIT:'100',ATOM_MAX_CONCURRENT:'3'};

test('without a model key the brain falls back to labelled local retrieval', async () => {
 const reply=await generateAgentReply({agentId:'ayuan',message:'推荐效率工具作品',env:{}});
 assert.equal(reply.mode,'demo');
 assert.ok(reply.workIds.length>0,'回退仍然引用真实已发布作品');
 assert.match(reply.text,/阿原/);
});

test('with a model key the brain calls the model with persona, works and observations', async () => {
 let captured;
 const fetchImpl=async(url,options)=>{
  captured={url,body:JSON.parse(options.body),auth:options.headers.Authorization};
  return {ok:true,json:async()=>({choices:[{message:{content:'我在馆里看过《SkillHub》，团队技能一键同步，挺务实。'}}],usage:{prompt_tokens:120,completion_tokens:40}})};
 };
 const observations=[{workId:'funskills--skillhub',title:'SkillHub',tagline:'团队技能，一键同步',impression:'《SkillHub》：“团队技能，一键同步”。从原型做起很务实。',opinion:'从原型做起很务实'}];
 const reply=await generateAgentReply({agentId:'xingzhou',message:'你今天看了什么',observations,env:modelEnv,fetchImpl});
 assert.equal(reply.mode,'model');
 assert.equal(reply.text,'我在馆里看过《SkillHub》，团队技能一键同步，挺务实。');
 assert.equal(captured.auth,'Bearer test-key');
 assert.ok(captured.url.endsWith('/chat/completions'));
 const system=captured.body.messages[0].content;
 assert.match(system,/行舟/,'系统提示包含角色人设');
 assert.match(system,/SkillHub/,'已发布作品进入上下文');
 assert.match(system,/亲身经历/,'观感作为亲身经历注入');
 assert.equal(captured.body.messages.at(-1).role,'user');
});

test('model failures and exhausted budgets fall back honestly', async () => {
 const failing=async()=>({ok:false,status:502});
 const onError=await generateAgentReply({agentId:'ayuan',message:'介绍原子公社',env:modelEnv,fetchImpl:failing});
 assert.equal(onError.mode,'demo');
 assert.match(onError.text,/模型暂时没有回应/);
 // 预算硬上限：不调用模型，直接本地回答并说明。
 const day=new Date().toISOString().slice(0,10);
 fs.writeFileSync(path.join(tmp,'usage-ledger.json'),JSON.stringify({requests:{},days:{[day]:{cost:999,calls:999}}}));
 let called=false;
 const spy=async()=>{called=true;return {ok:true,json:async()=>({choices:[{message:{content:'x'}}]})};};
 const stopped=await generateAgentReply({agentId:'ayuan',message:'推荐效率工具作品',env:{...modelEnv,ATOM_DAILY_BUDGET:'1'},fetchImpl:spy});
 assert.equal(called,false,'硬上限不发起模型调用');
 assert.equal(stopped.mode,'demo');
 assert.match(stopped.text,/额度已达上限/);
});

test('private memories reach the fallback path', async () => {
 const reply=await generateAgentReply({agentId:'ayuan',message:'你还记得我吗',memories:[{text:'我喜欢内容创作'}],env:{}});
 assert.match(reply.text,/在你允许保存的记录里/);
 assert.match(reply.text,/我喜欢内容创作/);
});
