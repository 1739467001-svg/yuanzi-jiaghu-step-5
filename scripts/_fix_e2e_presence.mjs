import fs from 'node:fs';
const p='scripts/smoke-multiplayer.mjs';
let s=fs.readFileSync(p,'utf8');
const anchor=`  assert.match(await a.locator('.chat-mode').textContent(),/AI 侠客/);
  // 第三方看不到与 AI 的私聊内容。
  assert.ok(!(await c.locator('body').textContent()).includes('为你找到了'),'第三方读不到与 AI 的私聊回复');
  await a.getByRole('button',{name:'离开会话'}).click();`;
if(!s.includes(anchor))throw new Error('anchor not found');
const add=`  assert.match(await a.locator('.chat-mode').textContent(),/AI 侠客/);
  // 联机私聊同样展示 AI 侠客的公开见闻（与本地演示一致）。
  assert.ok(await a.locator('.public-memories').count()===1,'联机私聊展示江湖见闻');
  assert.match(await a.locator('.public-memories').textContent(),/江湖见闻/,'见闻区标题正确');
  // 第三方看不到与 AI 的私聊内容。
  assert.ok(!(await c.locator('body').textContent()).includes('为你找到了'),'第三方读不到与 AI 的私聊回复');
  await a.getByRole('button',{name:'离开会话'}).click();
  // 6.5 AI 见闻名帖卡：点开有公开动态的 AI 侠客，名帖卡展示"最近动态/最近在看"。
  const presenceReady=await a.evaluate(()=>{
   const presence=window.__atomOnlinePresence||{};
   return Object.values(presence).some(p=>(p.recent||[]).length>0||(p.views||[]).length>0);
  });
  if(presenceReady){
   const withPresence=await a.evaluate(()=>{
    const presence=window.__atomOnlinePresence||{};
    const hit=Object.values(presence).find(p=>(p.recent||[]).length>0||(p.views||[]).length>0);
    return hit?hit.id:null;
   });
   const aiName=await a.evaluate(id=>(window.__atomOnlinePlayers||[]).find(p=>p.id===id)?.name||null,withPresence);
   if(aiName){
    await a.locator('.nearby-avatars button',{hasText:aiName}).click();
    await a.getByRole('dialog',{name:aiName}).waitFor({timeout:10000});
    assert.ok(await a.locator('.presence-card').count()>=1,'名帖卡展示 AI 侠客的最近动态/最近在看');
    assert.match(await a.locator('.presence-card').textContent(),/最近动态|最近在看/,'见闻分区标题正确');
    await a.getByRole('button',{name:'关闭窗口'}).click();
   }
  }`;
s=s.replace(anchor,add);
fs.writeFileSync(p,s);
console.log('e2e presence checks added');
