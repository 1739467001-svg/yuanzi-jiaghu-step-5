import {useState} from 'react';
import {Check,UserPlus,UserMinus} from 'lucide-react';
const ELDER_TITLES=['长老','执法长老','传功长老','护法长老'];
const DISCIPLE_TITLES=['大师兄','二师兄','大师姐','二师姐','师弟','师妹','弟子'];
// 门派创始人管理台：长老阁与弟子的增删（称号从预设选）。
export default function SectAdmin({sect,busy,onApi}){
 const [elderName,setElderName]=useState(''),[elderTitle,setElderTitle]=useState('长老');
 const [discName,setDiscName]=useState(''),[discTitle,setDiscTitle]=useState('弟子');
 const addElder=async()=>{
  if(!elderName.trim())return;
  await onApi(`/api/sects/${sect.id}/elders`,{name:elderName.trim(),title:elderTitle});
  setElderName('');
 };
 const addDisciple=async()=>{
  if(!discName.trim())return;
  await onApi(`/api/sects/${sect.id}/disciples`,{name:discName.trim(),title:discTitle});
  setDiscName('');
 };
 return <div className="sect-admin">
  <h4>门派管理（仅创始人可见）</h4>
  <div className="sect-admin-row">
   <input aria-label="长老昵称" placeholder="长老昵称" maxLength={20} value={elderName} onChange={e=>setElderName(e.target.value)}/>
   <select aria-label="长老称号" value={elderTitle} onChange={e=>setElderTitle(e.target.value)}>{ELDER_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select>
   <button className="secondary-button" disabled={busy||!elderName.trim()} onClick={addElder}><UserPlus size={14}/>加入长老阁</button>
  </div>
  <div className="sect-admin-row">
   <input aria-label="弟子昵称" placeholder="弟子昵称" maxLength={20} value={discName} onChange={e=>setDiscName(e.target.value)}/>
   <select aria-label="弟子称号" value={discTitle} onChange={e=>setDiscTitle(e.target.value)}>{DISCIPLE_TITLES.map(t=><option key={t} value={t}>{t}</option>)}</select>
   <button className="secondary-button" disabled={busy||!discName.trim()} onClick={addDisciple}><Check size={14}/>收入门下</button>
  </div>
  {(sect.elders.length>0||sect.disciples.length>0)&&<div className="sect-admin-members">
   {sect.elders.map(e=><span key={e.userId} className="sect-chip elder">{e.title} · {e.name}<button aria-label={`移出${e.name}`} onClick={()=>onApi(`/api/sects/${sect.id}/members/remove`,{userId:e.userId})}><UserMinus size={12}/></button></span>)}
   {sect.disciples.map(d=><span key={d.userId} className="sect-chip disciple">{d.title} · {d.name}<button aria-label={`移出${d.name}`} onClick={()=>onApi(`/api/sects/${sect.id}/members/remove`,{userId:d.userId})}><UserMinus size={12}/></button></span>)}
  </div>}
 </div>;
}
