// 账号与会话（本地演示的身份 providers）：注册/登录/登出/会话验证/名帖更新。
// 密码 scrypt 加盐存储；会话令牌持久化在 data/accounts.json，服务重启不清除登录态。
// 联机世界的角色 ID 一律由服务端从会话解析，不信任客户端传入的身份。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const dataDir=()=>process.env.ATOM_DATA_DIR?path.resolve(process.env.ATOM_DATA_DIR):path.join(root,'data');
const storeFile=()=>path.join(dataDir(),'accounts.json');
const SESSION_DAYS=30;

function readStore(){
 try{const store=JSON.parse(fs.readFileSync(storeFile(),'utf8'));if(store&&typeof store==='object')return {users:store.users||{},sessions:store.sessions||{}};}catch{}
 return {users:{},sessions:{}};
}
function writeStore(store){
 const file=storeFile();
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(store,null,2));
 fs.renameSync(tmp,file);
}
const validName=v=>typeof v==='string'&&[...v.trim()].length>=1&&[...v.trim()].length<=20;
const validColor=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
const hashPassword=(password,salt)=>crypto.scryptSync(String(password),salt,64).toString('hex');

export function register(name,password,color='#427ab5'){
 const display=String(name||'').trim();
 if(!validName(display))throw new Error('名帖昵称需要 1—20 个字符');
 if(typeof password!=='string'||[...password].length<6)throw new Error('密码至少 6 位');
 if(!validColor(color))throw new Error('衣带颜色格式不正确');
 const store=readStore();
 if(Object.values(store.users).some(u=>u.name===display))throw new Error('这个名帖昵称已被使用');
 const salt=crypto.randomBytes(16).toString('hex');
 const user={id:`u-${crypto.randomBytes(8).toString('hex')}`,name:display,color,salt,passHash:hashPassword(password,salt),createdAt:new Date().toISOString()};
 store.users[user.id]=user;
 writeStore(store);
 return publicUser(user);
}
export function login(name,password){
 const store=readStore();
 const display=String(name||'').trim();
 const user=Object.values(store.users).find(u=>u.name===display);
 if(!user||user.passHash!==hashPassword(String(password||''),user.salt))throw new Error('名帖昵称或密码不正确');
 const token=crypto.randomBytes(24).toString('hex');
 store.sessions[token]={userId:user.id,createdAt:Date.now(),expiresAt:Date.now()+SESSION_DAYS*86400000};
 // 顺手清理过期会话。
 for(const [t,s] of Object.entries(store.sessions))if(s.expiresAt<Date.now())delete store.sessions[t];
 writeStore(store);
 return {token,user:publicUser(user)};
}
// 签发本地会话（外部身份验证通过后使用）。
export function issueSession(userId){
 const store=readStore();
 const token=crypto.randomBytes(24).toString('hex');
 store.sessions[token]={userId,createdAt:Date.now(),expiresAt:Date.now()+SESSION_DAYS*86400000};
 for(const [t,s] of Object.entries(store.sessions))if(s.expiresAt<Date.now())delete store.sessions[t];
 writeStore(store);
 return token;
}
export function logout(token){
 const store=readStore();
 if(store.sessions[token]){delete store.sessions[token];writeStore(store);return true;}
 return false;
}
export function verify(token){
 if(typeof token!=='string'||!token)return null;
 const store=readStore();
 const session=store.sessions[token];
 if(!session||session.expiresAt<Date.now())return null;
 const user=store.users[session.userId];
 return user?{userId:user.id,user:publicUser(user)}:null;
}
export function updateProfile(token,{name,color}={}){
 const session=verify(token);
 if(!session)throw new Error('登录状态已失效，请重新登录');
 const store=readStore();
 const user=store.users[session.userId];
 if(name!==undefined){
  const display=String(name||'').trim();
  if(!validName(display))throw new Error('名帖昵称需要 1—20 个字符');
  if(Object.values(store.users).some(u=>u.name===display&&u.id!==user.id))throw new Error('这个名帖昵称已被使用');
  user.name=display;
 }
 if(color!==undefined){
  if(!validColor(color))throw new Error('衣带颜色格式不正确');
  user.color=color;
 }
 writeStore(store);
 return publicUser(user);
}
// 外部身份映射：同一 subject 始终映射到同一本地账号（首次登录自动建档）。
export function findOrCreateExternal(subject,name){
 const store=readStore();
 const existing=Object.values(store.users).find(u=>u.externalId===subject);
 if(existing){
  if(name&&name!==existing.name&&!Object.values(store.users).some(u=>u.name===name&&u.id!==existing.id))existing.name=name;
  writeStore(store);
  return publicUser(existing);
 }
 const base=String(name||'社区侠客').trim()||'社区侠客';
 let display=base,i=2;
 while(Object.values(store.users).some(u=>u.name===display))display=`${base}${i++}`;
 const user={id:`u-${crypto.randomBytes(8).toString('hex')}`,name:display,color:'#427ab5',salt:'',passHash:'',externalId:subject,createdAt:new Date().toISOString()};
 store.users[user.id]=user;
 writeStore(store);
 return publicUser(user);
}
export function publicUser(user){
 return {id:user.id,name:user.name,color:user.color,createdAt:user.createdAt};
}
