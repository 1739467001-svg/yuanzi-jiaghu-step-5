// 门派管理台（M2）：入派申请审核（仅掌门）、公告（掌门/长老）、加入方式（仅掌门）。
import {useState} from 'react';
import {Check,ClipboardList,Megaphone,Trash2,X,Unlock,Lock,UserPlus} from 'lucide-react';

const POLICY_LABEL={open:'开放加入',apply:'申请制',invite:'邀请制'};

export default function SectConsole({sect,busy,meId,onApi}){
 const isFounder=sect.founderId===meId;
 const isElder=(sect.elders||[]).some(e=>e.userId===meId);
 const [message,setMessage]=useState('');
 const [notice,setNotice]=useState('');
 const pending=(sect.applications||[]).filter(a=>a.status==='pending');
 const history=(sect.applications||[]).filter(a=>a.status!=='pending').slice(0,8);
 if(!isFounder&&!isElder)return null;
 return <div className="sect-console">
  <h4><ClipboardList size={14}/>门派事务（{isFounder?'掌门':'长老'}）</h4>

  {isFounder&&<div className="sect-console-block">
   <div className="sect-console-label"><UserPlus size={13}/>加入方式</div>
   <div className="sect-policy-row">
    {Object.keys(POLICY_LABEL).map(k=><button key={k} className={`chip ${(sect.joinPolicy||'apply')===k?'on':''}`} disabled={busy} onClick={()=>onApi(`/api/sects/${sect.id}/join-policy`,{policy:k})}>
     {k==='open'?<Unlock size={12}/>:k==='invite'?<Lock size={12}/>:<UserPlus size={12}/>}{POLICY_LABEL[k]}
    </button>)}
   </div>
   <p className="sect-hint">开放加入：点一下就进门；申请制：掌门审核后入驻；邀请制：只接受掌门添加。</p>
  </div>}

  {(isFounder||isElder)&&<div className="sect-console-block">
   <div className="sect-console-label"><Megaphone size={13}/>公告（{sect.notices?.length||0}）</div>
   <div className="sect-console-row">
    <input aria-label="公告内容" placeholder="写一条门派公告…" maxLength={200} value={notice} onChange={e=>setNotice(e.target.value)}/>
    <button className="secondary-button" disabled={busy||!notice.trim()} onClick={async()=>{await onApi(`/api/sects/${sect.id}/notices`,{text:notice.trim()});setNotice('');}}>发布</button>
   </div>
   {(sect.notices||[]).map(n=><div className="sect-notice" key={n.id}>
    <div><p>{n.text}</p><small>{n.by} · {new Date(n.at).toLocaleDateString('zh-CN')}</small></div>
    <button aria-label={`删除公告：${n.text.slice(0,8)}`} disabled={busy} onClick={()=>onApi(`/api/sects/${sect.id}/notices/${n.id}`)}><Trash2 size={12}/></button>
   </div>)}
  </div>}

  {isFounder&&<div className="sect-console-block">
   <div className="sect-console-label"><Check size={13}/>入派申请（待处理 {pending.length}）</div>
   {pending.length?pending.map(a=><div className="sect-apply" key={a.id}>
    <div><b>{a.name}</b>{a.message&&<p>“{a.message}”</p>}<small>{new Date(a.createdAt).toLocaleString('zh-CN',{hour12:false})}</small></div>
    <div className="sect-apply-actions">
     <button className="primary-button" disabled={busy} onClick={()=>onApi(`/api/sects/${sect.id}/applications/${a.id}`,{decision:'approve'})} aria-label={`同意 ${a.name} 加入`}><Check size={14}/></button>
     <button className="secondary-button" disabled={busy} onClick={()=>onApi(`/api/sects/${sect.id}/applications/${a.id}`,{decision:'reject'})} aria-label={`婉拒 ${a.name}`}><X size={14}/></button>
    </div>
   </div>):<p className="sect-hint">暂时没有人申请。把小镇链接分享出去，感兴趣的人就能申请。</p>}
   {history.length?<div className="sect-apply-history">
    {history.map(a=><span key={a.id} className={`sect-mini ${a.status==='approved'?'ok':'no'}`}>{a.name} · {a.status==='approved'?'已入驻':'已婉拒'}</span>)}
   </div>:null}
  </div>}
 </div>;
}

// 访客/弟子侧的「申请加入」入口。
export function SectJoin({sect,busy,loggedIn,onApply}){
 const [message,setMessage]=useState('');
 const policy=sect.joinPolicy||'apply';
 return <div className="sect-join">
  <div className="sect-console-label"><UserPlus size={13}/>加入「{sect.name}」</div>
  <p className="sect-hint">{policy==='invite'?'这座门派目前只接受掌门邀请。':policy==='open'?'这座门派开放加入，点一下就入驻为弟子。':'留下几句话，掌门看过就会让你入驻。'}</p>
  {policy!=='invite'&&<div className="sect-console-row">
   <input aria-label="申请留言" placeholder={loggedIn?'给掌门留句话（选填）':'先登录名帖，再给掌门留句话'} maxLength={200} value={message} onChange={e=>setMessage(e.target.value)}/>
   <button className="primary-button" disabled={busy} onClick={()=>onApply({message:message.trim()})}>{busy?'提交中…':policy==='open'?'立即加入':'申请加入'}</button>
  </div>}
 </div>;
}
