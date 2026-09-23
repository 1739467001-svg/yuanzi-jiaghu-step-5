import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {SignJWT,exportJWK,generateKeyPair} from 'jose';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atom-extauth-'));
process.env.ATOM_DATA_DIR=tmp;
const {verifyExternalToken,externalAuthConfig,externalAuthReady} = await import('../server/external-auth.mjs');
const {findOrCreateExternal,issueSession,verify} = await import('../server/accounts.mjs');

// 本地 JWKS 服务：用真实 RSA 密钥签署 JWT，模拟社区账号体系。
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=await exportJWK(publicKey);
jwk.kid='test-key-1';jwk.alg='RS256';jwk.use='sig';
const jwks=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({keys:[jwk]}));
});
await new Promise(r=>jwks.listen(0,r));
const jwksUrl=`http://127.0.0.1:${jwks.address().port}/.well-known/jwks.json`;
const env={ATOM_AUTH_MODE:'external',ATOM_AUTH_JWKS_URL:jwksUrl,ATOM_AUTH_ISSUER:'https://atomclub.example',ATOM_AUTH_AUDIENCE:'atom-jianghu'};
const signToken=async({sub='user-42',name='社区侠客',issuer='https://atomclub.example',audience='atom-jianghu',exp='10m'}={})=>
 new SignJWT({name}).setProtectedHeader({alg:'RS256',kid:'test-key-1'}).setSubject(sub).setIssuer(issuer).setAudience(audience).setExpirationTime(exp).sign(privateKey);

test.after(()=>jwks.close());

test('valid community token verifies and maps to a stable local account', async () => {
 const token=await signToken();
 const identity=await verifyExternalToken(token,env);
 assert.deepEqual(identity,{subject:'user-42',name:'社区侠客'});
 // 同一 subject 始终同一账号；重名不冲突。
 const first=findOrCreateExternal(identity.subject,identity.name);
 const second=findOrCreateExternal(identity.subject,'社区侠客');
 assert.equal(first.id,second.id,'映射稳定');
 // 签发本地会话后可正常验证（其余系统无感）。
 const session=issueSession(first.id);
 assert.equal(verify(session).userId,first.id);
});

test('tampered, wrong-issuer and expired tokens are rejected', async () => {
 const good=await signToken();
 const tampered=good.slice(0,-8)+'AAAAAAAA';
 assert.equal(await verifyExternalToken(tampered,env),null,'篡改签名被拒');
 assert.equal(await verifyExternalToken(await signToken({issuer:'https://evil.example'}),env),null,'错误签发者被拒');
 assert.equal(await verifyExternalToken(await signToken({audience:'other-app'}),env),null,'错误受众被拒');
 assert.equal(await verifyExternalToken(await signToken({exp:'-1m'}),env),null,'过期令牌被拒');
 assert.equal(await verifyExternalToken('not-a-jwt',env),null,'非 JWT 被拒');
 assert.equal(await verifyExternalToken(good,{ATOM_AUTH_MODE:'local'}),null,'local 模式不验证外部令牌');
});

test('introspection mode verifies via RFC 7662 endpoint', async () => {
 const introspectUrl=`http://127.0.0.1:${jwks.address().port}/introspect`;
 const introEnv={ATOM_AUTH_MODE:'external',ATOM_AUTH_INTROSPECT_URL:introspectUrl,ATOM_AUTH_CLIENT_ID:'atom-jianghu',ATOM_AUTH_CLIENT_SECRET:'s3cret'};
 const fetchImpl=async(url,options)=>{
  const body=new URLSearchParams(options.body);
  assert.equal(body.get('token'),'good-token');
  assert.equal(body.get('client_id'),'atom-jianghu');
  if(body.get('token')==='good-token')return {ok:true,json:async()=>({active:true,sub:'user-77',name:'内省侠客'})};
  return {ok:true,json:async()=>({active:false})};
 };
 const identity=await verifyExternalToken('good-token',introEnv,{fetchImpl});
 assert.deepEqual(identity,{subject:'user-77',name:'内省侠客'});
 assert.equal(await verifyExternalToken('bad-token',introEnv,{fetchImpl}),null,'未激活令牌被拒');
 assert.equal(externalAuthReady(introEnv),true);
 assert.equal(externalAuthReady({ATOM_AUTH_MODE:'external'}),false,'缺少配置视为未就绪');
});

test('config reports the mode without leaking secrets', () => {
 const config=externalAuthConfig(env);
 assert.equal(config.mode,'external');
 assert.equal(config.jwksUrl,jwksUrl);
 assert.equal(config.clientSecret,'');
 assert.equal(externalAuthConfig({}).mode,'local');
});

test('external accounts keep distinct display names on conflicts', () => {
 // 本地已存在同名账号时，外部账号自动加后缀，不覆盖他人。
 const local=findOrCreateExternal('subject-local','重名测试');
 const ext=findOrCreateExternal('subject-external','重名测试');
 assert.notEqual(local.id,ext.id);
 assert.notEqual(local.name,ext.name,'同名冲突自动区分');
});
