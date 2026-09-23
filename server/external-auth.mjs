// 外部身份提供方（生产鉴权接入点）：把社区账号体系的令牌换成本地会话。
// 两种验证方式（环境变量配置）：
//   JWKS 模式：ATOM_AUTH_JWKS_URL + ATOM_AUTH_ISSUER/ATOM_AUTH_AUDIENCE（RS/ES 签名 JWT）
//   内省模式：ATOM_AUTH_INTROSPECT_URL + ATOM_AUTH_CLIENT_ID/ATOM_AUTH_CLIENT_SECRET（RFC 7662）
// 外部主体（subject）稳定映射到本地账号：首次登录自动建档，之后同一 subject 始终同一账号。
import {createRemoteJWKSet,jwtVerify} from 'jose';

let jwksCache=null;
const getJWKS=url=>{
 if(!jwksCache||jwksCache.jwksUrl!==url){
  jwksCache={jwksUrl:url,jwks:createRemoteJWKSet(new URL(url))};
 }
 return jwksCache.jwks;
};
export function externalAuthConfig(env={}){
 const mode=env.ATOM_AUTH_MODE==='external'?'external':'local';
 return {
  mode,
  jwksUrl:env.ATOM_AUTH_JWKS_URL||'',
  issuer:env.ATOM_AUTH_ISSUER||'',
  audience:env.ATOM_AUTH_AUDIENCE||'',
  introspectUrl:env.ATOM_AUTH_INTROSPECT_URL||'',
  clientId:env.ATOM_AUTH_CLIENT_ID||'',
  clientSecret:env.ATOM_AUTH_CLIENT_SECRET||'',
 };
}
export function externalAuthReady(env={}){
 const config=externalAuthConfig(env);
 if(config.mode!=='external')return false;
 if(config.jwksUrl)return true;
 return !!(config.introspectUrl&&config.clientId);
}
// 验证外部令牌，返回 {subject,name}；失败返回 null。fetchImpl/JWKS 均可注入用于测试。
export async function verifyExternalToken(token,env={},{fetchImpl=fetch,jwks=null}={}){
 if(typeof token!=='string'||!token.trim())return null;
 const config=externalAuthConfig(env);
 if(config.mode!=='external'||!externalAuthReady(env))return null;
 if(config.jwksUrl){
  try{
   const key=jwks||getJWKS(config.jwksUrl);
   const options={};
   if(config.issuer)options.issuer=config.issuer;
   if(config.audience)options.audience=config.audience;
   const {payload}=await jwtVerify(token,key,options);
   const subject=payload.sub||payload.userId||payload.username;
   if(typeof subject!=='string'||!subject)return null;
   const name=[payload.name,payload.nickname,payload.preferred_username,subject].find(v=>typeof v==='string'&&v.trim());
   return {subject,name:(name||subject).slice(0,20)};
  }catch{return null;}
 }
 // 内省模式（RFC 7662）。
 try{
  const body=new URLSearchParams({token});
  if(config.clientId)body.set('client_id',config.clientId);
  if(config.clientSecret)body.set('client_secret',config.clientSecret);
  const response=await fetchImpl(config.introspectUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const data=await response.json();
  if(!data||data.active!==true)return null;
  const subject=data.sub||data.user_id||data.username;
  if(typeof subject!=='string'||!subject)return null;
  const name=[data.name,data.nickname,data.username,subject].find(v=>typeof v==='string'&&v.trim());
  return {subject,name:(name||subject).slice(0,20)};
 }catch{return null;}
}
