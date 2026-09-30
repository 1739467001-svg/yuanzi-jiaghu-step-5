// 移动端布局体检：逐屏检查元素重叠、横向溢出、触控目标过小。
// 用法：node scripts/mobile-audit.mjs（需先 npm run build 并起 preview 5173）
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const VIEWPORTS=[{name:'iPhone SE',width:375,height:667},{name:'iPhone 14',width:390,height:844},{name:'小屏安卓',width:360,height:640},{name:'iPad mini',width:744,height:1133},{name:'桌面',width:1440,height:900}];
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const problems=[];
const note=(vp,msg)=>problems.push(`[${vp}] ${msg}`);
const KEY=['.topbar','.topbar .brand','.topbar nav','.top-actions','.mode-switch','.profile-button','.scene-intro','.map-caption','.world-tools','.controls-tip','.right-rail','.scene-pin.player'];

async function audit(vp,label){
 const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.waitForSelector('.scene-pin.player');
 const skip=page.getByRole('button',{name:'跳过引导'});
 if(await skip.count())await skip.click();
 await page.waitForTimeout(1200);
 // 1) 横向溢出
 const overflow=await page.evaluate(()=>({docScroll:document.documentElement.scrollWidth,docClient:document.documentElement.clientWidth,
  wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1).slice(0,6).map(e=>e.className+'@'+Math.round(e.getBoundingClientRect().right))}));
 if(overflow.docScroll>overflow.docClient+1)note(label,`页面横向溢出 ${overflow.docScroll}>${overflow.docClient}：${overflow.wide.join(', ')}`);
 // 2) 关键元素两两重叠
 const rects=await page.evaluate(selectors=>{
  const out={};
  for(const sel of selectors){
   const el=document.querySelector(sel);
   if(!el){out[sel]=null;continue;}
   const r=el.getBoundingClientRect();
   if(r.width<1||r.height<1){out[sel]=null;continue;}
   out[sel]={el:true,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),text:(el.innerText||'').replace(/\n/g,' ').slice(0,18)};
  }
  return out;
 },KEY);
 // 2) 关键元素两两重叠（父子包含不算——那是正常的嵌套）
 const overlaps=await page.evaluate(selectors=>{
  const els=selectors.map(sel=>{const el=document.querySelector(sel);return el?{sel,el}:null;}).filter(Boolean);
  const out=[];
  for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
   const a=els[i],b=els[j];
   if(a.el.contains(b.el)||b.el.contains(a.el))continue;
   const ra=a.el.getBoundingClientRect(),rb=b.el.getBoundingClientRect();
   if(ra.width<1||rb.width<1)continue;
   const ox=Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left),oy=Math.min(ra.bottom,rb.bottom)-Math.max(ra.top,rb.top);
   if(ox>2&&oy>2)out.push(`${a.sel}∩${b.sel} ${Math.round(ox)}x${Math.round(oy)}px（${(a.el.innerText||'').replace(/\n/g,' ').slice(0,14)} / ${(b.el.innerText||'').replace(/\n/g,' ').slice(0,14)}）`);
  }
  return out;
 },KEY);
 overlaps.forEach(o=>note(label,'重叠 '+o));
 // 3) 触控目标过小（<28px 的可见按钮）
 const small=await page.evaluate(()=>[...document.querySelectorAll('button,a[href],input,select')].filter(e=>{
  const r=e.getBoundingClientRect();
  return r.width>0&&r.height>0&&(r.width<24||r.height<24)&&!e.closest('.chat-messages')&&!e.closest('.scene-labels')&&!e.closest('.sect-hud');
 }).slice(0,10).map(e=>{const r=e.getBoundingClientRect();const p=e.parentElement;return `${e.className||e.tagName}<${p?p.className||p.tagName:''}>${Math.round(r.width)}x${Math.round(r.height)} '${(e.innerText||'').slice(0,10)}'`;}));
 if(small.length)note(label,'触控目标过小：'+small.join(', '));
 // 4) 场景名牌互相重叠
 const pinOverlap=await page.evaluate(()=>{
  const pins=[...document.querySelectorAll('.scene-pin')].map(p=>({t:p.textContent,r:p.getBoundingClientRect()}));
  const out=[];
  for(let i=0;i<pins.length;i++)for(let j=i+1;j<pins.length;j++){
   const a=pins[i].r,b=pins[j].r;
   const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left),oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
   if(ox>1&&oy>1)out.push(pins[i].t+'∩'+pins[j].t);
  }
  return out;
 });
 if(pinOverlap.length)note(label,'场景名牌重叠：'+pinOverlap.join(', '));
 await page.screenshot({path:`artifacts/mobile-${vp.name}-town.png`});

 // ---- 门派大殿 ----
 await page.getByRole('button',{name:'原子门派 ↗'}).click();
 await page.getByRole('button',{name:'进入门派大殿'}).click();
 await page.waitForSelector('.sect-hud .sect-hud-card');
 await page.waitForTimeout(600);
 const sect=await page.evaluate(()=>{
  const card=document.querySelector('.sect-hud-card').getBoundingClientRect();
  const back=document.querySelector('.sect-hud .back-link')?.getBoundingClientRect();
  const pager=document.querySelector('.sect-pager')?.getBoundingClientRect();
  const rows=[...document.querySelectorAll('.sect-row')].map(r=>r.getBoundingClientRect());
  const overlap=(a,b)=>a&&b?Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1:false;
  return {
   cardBottom:Math.round(card.bottom),viewH:window.innerHeight,
   backUnderCard:overlap(back,document.querySelector('.sect-hud-card').getBoundingClientRect()),
   pagerUnderCard:overlap(pager,document.querySelector('.sect-hud-card').getBoundingClientRect()),
   rowsVisible:rows.filter(r=>r.top<window.innerHeight&&r.bottom>0).length,
   rowsOverlapping:rows.some((r,i)=>rows.some((o,j)=>i<j&&Math.min(r.right,o.right)-Math.max(r.left,o.left)>1&&Math.min(r.bottom,o.bottom)-Math.max(r.top,o.top)>1)),
   overflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
  };
 });
 if(sect.cardBottom>sect.viewH+2)note(label,`门派面板超出屏幕底部 ${sect.cardBottom}>${sect.viewH}`);
 if(sect.rowsOverlapping)note(label,'门派名录行互相重叠');
 if(sect.overflowX)note(label,'门派大殿横向溢出');
 await page.screenshot({path:`artifacts/mobile-${vp.name}-sects.png`});

 // ---- 门派内景 ----
 await page.locator('.sect-row').first().click();
 await page.waitForSelector('.sect-hud.interior');
 await page.waitForTimeout(600);
 const interior=await page.evaluate(()=>{
  const card=document.querySelector('.sect-hud.interior .sect-hud-card');
  const r=card.getBoundingClientRect();
  const back=document.querySelector('.sect-hud.interior .back-link')?.getBoundingClientRect();
  const cr=card.getBoundingClientRect();
  const overlap=!card.contains(document.querySelector('.sect-hud.interior .back-link'))&&Math.min(back.right,cr.right)-Math.max(back.left,cr.left)>1&&Math.min(back.bottom,cr.bottom)-Math.max(back.top,cr.top)>1;
  const roles=[...document.querySelectorAll('.sect-role')].map(e=>e.getBoundingClientRect());
  return {cardBottom:Math.round(r.bottom),viewH:window.innerHeight,backOverlap:overlap,
   rolesOverlapping:roles.some((a,i)=>roles.some((b,j)=>i<j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),
   overflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
   scrollable:card.scrollHeight>card.clientHeight};
 });
 if(interior.cardBottom>interior.viewH+2)note(label,`门派内画面板超出屏幕 ${interior.cardBottom}>${interior.viewH}`);
 if(interior.backOverlap)note(label,'内景返回键与面板重叠');
 if(interior.rolesOverlapping)note(label,'内景角色位次互相重叠');
 if(interior.overflowX)note(label,'门派内景横向溢出');
 await page.screenshot({path:`artifacts/mobile-${vp.name}-sect-interior.png`});

 // ---- 武林大会（作品目录） ----
 await page.getByRole('button',{name:'返回门派大殿'}).click();
 await page.getByRole('button',{name:'返回小镇'}).click();
 await page.waitForTimeout(500);
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 await page.waitForSelector('.work-card');
 await page.waitForTimeout(600);
 const gallery=await page.evaluate(()=>({overflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
  grid:getComputedStyle(document.querySelector('.work-grid')).gridTemplateColumns.split(' ').length,
  introOverCaption:(()=>{const a=document.querySelector('.scene-intro')?.getBoundingClientRect(),b=document.querySelector('.map-caption')?.getBoundingClientRect();return a&&b?Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1:false;})()}));
 if(gallery.overflowX)note(label,'展示馆横向溢出');
 if(vp.width<650&&gallery.grid!==2)note(label,'手机端作品网格不是双列（当前 '+gallery.grid+'）');
 if(vp.width>=650&&gallery.grid<2)note(label,'作品网格少于两列');
 await page.screenshot({path:`artifacts/mobile-${vp.name}-gallery.png`});
 if(errors.length)note(label,'页面报错：'+errors.join(' | '));
 await page.close();
}
for(const vp of VIEWPORTS){await audit(vp,vp.name);console.log('已检查',vp.name);}
await browser.close();
console.log('\n===== 体检结果 =====');
if(!problems.length){console.log('✅ 未发现重叠/溢出/过小触控目标');}
else{problems.forEach(p=>console.log('❌',p));process.exitCode=1;}
export {assert};
