// 验收：静态站点上注册按钮/副标题/顶栏文案的诚实化 + 全流程仍通
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:5477';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errs=[];
page.on('pageerror',e=>errs.push(e.message));
await page.goto(base+'/');
await page.waitForSelector('.scene-pin.player',{timeout:30000});
const skip=page.getByRole('button',{name:'跳过引导'});
if(await skip.isVisible().catch(()=>false))await skip.click();
// 1) 先探测：打开账号框（点和阿原聊聊），副标题应为"本地演示身份…"
await page.getByRole('button',{name:/和阿原聊聊/}).click();
await page.locator('.auth-dialog').waitFor({timeout:10000});
const subtitle=await page.locator('.auth-dialog .auth-content p, .auth-dialog').first().textContent();
const sub=subtitle.includes('本地演示身份')?'✓ 如实(本地演示身份)':(subtitle.includes('本地服务')?'✗ 仍是旧文案':'?');
const btnText=await page.locator('.auth-dialog button.primary-button').last().textContent();
console.log('① 副标题:',sub,'| 按钮:',btnText.trim());
await page.getByRole('textbox',{name:'名帖昵称'}).fill('UI 验收');
await page.getByRole('textbox',{name:'密码'}).fill('password123');
await page.locator('.auth-dialog button.primary-button').last().click();
await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('本地演示身份'),null,{timeout:15000});
console.log('② 本地演示身份创建 ✓');
// 2) 顶栏显示"本地演示"
await page.waitForTimeout(400);
const topbar=await page.locator('.top-actions').textContent();
console.log('③ 顶栏:',topbar.includes('本地演示')?'✓ 显示本地演示':'✗ '+topbar.slice(0,40));
// 3) 点本地演示按钮 → 诚实提示
await page.locator('.mode-switch').click();
await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('本地演示身份，无法进入联机世界'),null,{timeout:8000});
console.log('④ 联机拦截提示 ✓');
// 4) 对话流程仍通：和阿原聊聊 → 发消息 → 回复
await page.getByRole('button',{name:/和阿原聊聊/}).click();
await page.locator('.chat-dialog').waitFor({timeout:10000});
await page.getByRole('textbox',{name:'聊天消息'}).fill('推荐内容创作作品');
await page.getByRole('button',{name:'发送消息',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('.chat-messages .message').length>=3,null,{timeout:15000});
console.log('⑤ 对话流程 ✓');
console.log('页面错误:',errs.length?errs.slice(0,2):'无');
await page.screenshot({path:'artifacts/local-identity-ui.png'});
await browser.close();
