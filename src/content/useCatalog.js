// 客户端内容访问层：联机开发优先读取内容接口，静态演示读内置快照，
// 接口失败时降级到同一份快照并在界面标示来源。世界或模型暂停不影响作品阅读。
// 联机模式轮询 /api/content/health 的 stateVersion：运营在后台发布或撤回后，
// 目录、展位与检索自动更新，不要求手动刷新。
import {useEffect,useRef,useState} from 'react';
import {catalog as bundledCatalog,normalizeCatalog} from './catalog.js';
import {SHARED_EXHIBITION} from './exhibition.js';

function exhibitionFrom(config){
 if(!config)return {config:SHARED_EXHIBITION,mismatch:false};
 return {config:{...SHARED_EXHIBITION,...config},mismatch:Number(config.layoutVersion)!==Number(SHARED_EXHIBITION.layoutVersion)};
}
export async function loadCatalog({staticDemo=false,fetchImpl=fetch}={}){
 if(staticDemo)return {status:'ready',source:'static-snapshot',catalog:bundledCatalog,error:null,exhibition:exhibitionFrom(null)};
 try{
  const response=await fetchImpl('/api/content/catalog',{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`内容接口返回 ${response.status}`);
  const data=await response.json();
  return {status:'ready',source:'api',catalog:normalizeCatalog(data.editions),error:null,exhibition:exhibitionFrom(data.exhibition),stateVersion:Number(data.stateVersion)||0};
 }catch(error){
  return {status:'ready',source:'snapshot-fallback',catalog:bundledCatalog,error,exhibition:exhibitionFrom(null)};
 }
}
export function useCatalog({staticDemo=false,refreshKey=0}={}){
 const [state,setState]=useState(()=>staticDemo?{status:'ready',source:'static-snapshot',catalog:bundledCatalog,error:null,exhibition:exhibitionFrom(null)}:{status:'loading',source:null,catalog:null,error:null,exhibition:exhibitionFrom(null)});
 const version=useRef(state.stateVersion||0);
 useEffect(()=>{
  if(staticDemo)return;
  let alive=true;
  loadCatalog({staticDemo:false}).then(next=>{if(alive){version.current=next.stateVersion||0;setState(next);}});
  return()=>{alive=false;};
 },[staticDemo,refreshKey]);
 useEffect(()=>{
  if(staticDemo)return;
  let alive=true;
  const timer=setInterval(async()=>{
   try{
    const response=await fetch('/api/content/health',{headers:{Accept:'application/json'}});
    if(!response.ok)return;
    const health=await response.json();
    if(!alive||Number(health.stateVersion)===version.current)return;
    version.current=Number(health.stateVersion)||0;
    const next=await loadCatalog({staticDemo:false});
    if(alive)setState(next);
   }catch{}
  },15000);
  return()=>{alive=false;clearInterval(timer);};
 },[staticDemo]);
 return state;
}
