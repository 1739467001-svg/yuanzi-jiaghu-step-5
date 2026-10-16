import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 运营令牌与审计写在临时目录，不碰工程内的 data/。
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-admin-'));
process.env.ATOM_DATA_DIR=tmp;
process.env.ATOM_ADMIN_TOKEN='tok-legacy';
process.env.ATOM_ADMIN_TOKENS='tok-a:运营甲,tok-b:运营乙,tok-c';

const {adminTokens,adminActor,isAdminRequest,noteAdminDenial,setWorkStatus,getAudit} = await import('../server/publication-store.mjs');

const req=(token,url='/api/admin/audit')=>({url,headers:token===undefined?{}:{'x-atom-admin':token}});

test('admin tokens parse legacy, named and unnamed entries', () => {
 const tokens=adminTokens(process.env);
 assert.equal(tokens.get('tok-legacy'),'local-admin','旧单令牌回落 local-admin');
 assert.equal(tokens.get('tok-a'),'运营甲');
 assert.equal(tokens.get('tok-b'),'运营乙');
 assert.equal(tokens.get('tok-c'),'local-admin','省略名称回落 local-admin');
 assert.equal(adminTokens({}).get('atom-local-demo'),'local-admin','什么都没配时的演示令牌');
 assert.equal(adminTokens({ATOM_ADMIN_TOKEN:'',ATOM_ADMIN_TOKENS:' , '}).size,1,'空配置只剩演示令牌');
});

test('adminActor resolves identity from the token; wrong or missing tokens are rejected', () => {
 assert.equal(adminActor(req('tok-a'),process.env),'运营甲');
 assert.equal(adminActor(req('tok-legacy'),process.env),'local-admin');
 assert.equal(adminActor(req('  tok-b  '),process.env),'运营乙','令牌首尾空白不影响');
 assert.equal(adminActor(req('tok-wrong'),process.env),null);
 assert.equal(adminActor(req(undefined),process.env),null);
 assert.equal(isAdminRequest(req('tok-b'),process.env),true);
 assert.equal(isAdminRequest(req('nope'),process.env),false);
});

test('audit events carry the server-side token identity as actor', () => {
 setWorkStatus('funskills--ecom-video','已撤回','运营甲','由令牌归属');
 const [event]=getAudit(1);
 assert.equal(event.actor,'运营甲','actor 取服务端从令牌解析的名称');
 assert.equal(event.action,'withdraw_work');
 setWorkStatus('funskills--ecom-video','已发布','运营乙');
});

test('audit is rotated by month and the legacy single file is still read', () => {
 const monthFile=path.join(tmp,`audit-log-${new Date().toISOString().slice(0,7)}.json`);
 assert.ok(fs.existsSync(monthFile),'审计写入当月分片 audit-log-YYYY-MM.json');
 // 旧版单文件（上一个部署留下的）也要能读。
 fs.writeFileSync(path.join(tmp,'audit-log.json'),JSON.stringify([
  {id:'audit-old',actor:'old',action:'withdraw_work',targetId:'x',scope:'work',before:{},after:{},time:'2026-01-01T00:00:00.000Z',note:''},
 ]));
 const events=getAudit(500);
 assert.ok(events.some(e=>e.id==='audit-old'),'旧单文件审计仍可读取');
 assert.ok(events[0].time>=events[events.length-1].time,'合并后按时间倒序（新的在前）');
});

test('denied admin requests are recorded once per path within the cooldown', () => {
 const before=getAudit(500).filter(e=>e.action==='auth_denied'&&e.targetId==='/api/admin/catalog').length;
 noteAdminDenial(req('bad-token','/api/admin/catalog'));
 noteAdminDenial(req('bad-token','/api/admin/catalog'));
 const denials=getAudit(500).filter(e=>e.action==='auth_denied'&&e.targetId==='/api/admin/catalog');
 assert.equal(denials.length,before+1,'同路径 60 秒内只记一次（防刷爆审计）');
 assert.equal(denials[0].actor,'(未通过)');
 assert.match(denials[0].note,/运营令牌校验失败/);
});
