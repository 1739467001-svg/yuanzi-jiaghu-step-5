// 门派管理台（M2）：入派申请审核（仅掌门）、公告（掌门/长老）、加入方式（仅掌门）。
import {useState} from 'react';
import {Check,ClipboardList,Megaphone,Trash2,X,Unlock,Lock,UserPlus,Gem,Share2} from 'lucide-react';

const POLICY_LABEL={open:'开放加入',apply:'申请制',invite:'邀请制'};

export default function SectConsole({sect,busy,meId,onApi,onSaveBenefits,onShare}){
 const isFounder=sect.founderId===meId;
 const isElder=(sect.elders||[]).some(e=>e.userId===meId);
 const [message,setMessage]=useState('');
 const [notice,setNotice]=useState('');
 const [benefit,setBenefit]=useState({title:'',detail:''});
 const pending=(sect.applications||[]).filter(a=>a.status==='pending');
 const history=(sect.applications||[]).filter(a=>a.status!=='pending').slice(0,8);
 const benefits=sect.benefits||[];
 const canManage=isFounder||isElder;
 if(!canManage)return null;
 return <div className="sect-console">
  <h4><ClipboardList size={14}/>门派事务（{isFounder?'掌门':'长老'}）</h4>

  {canManage&&<div className="sect-console-block">
   <div className="sect-console-label"><Share2 size={13}/>邀请与回流</div>
   <div className="sect-console-row">
    <button className="secondary-button" onClick={onShare}><Share2 size={13}/>复制我的邀请链接</button>
   </div>
   <p className="sect-hint">链接会带上你的身份。从你链接进来并最终入驻的人，会记在下面的申请历史里（邀请赠金的结算接口就绪后按这条对账）。</p>
   {(sect.applications||[]).filter(a=>a.inviterId).length>0&&<div className="sect-invite-log">
    {(sect.applications||[]).filter(a=>a.inviterId).slice(0,6).map(a=><span key={a.id} className="sect-mini">{a.name} · {a.status==='approved'?'已入驻':'审核中'}</span>)}
   </div>}
  </div>}

  {canManage&&<div className="sect-console-block">
   <div className="sect-console-label"><Gem size={13}/>权益碑（{benefits.length}）</div>
   {(sect.benefits||[]).length===0&&<p className="sect-hint">还没有权益。接入门派权益系统（Token / OPC）后，这里会是成员的福利清单；现在可以先手写几条。</p>}
   {benefits.map(b=><div className="sect-benefit" key={b.id}>
    <div><b>{b.title}</b>{b.detail&&<p>{b.detail}</p>}{b.url&&<a href={b.url} target="_blank" rel="noreferrer">查看详情 ↗</a>}</div>
    <button aria-label={`删除权益：${b.title}`} disabled={busy} onClick={()=>onSaveBenefits(benefits.filter(x=>x.id!==b.id))}><Trash2 size={12}/></button>
   </div>)}
   <div className="sect-console-row">
    <input aria-label="权益标题" placeholder="权益标题（如：门派专属资料包）" maxLength={30} value={benefit.title} onChange={e=>setBenefit(v=>({...v,title:e.target.value}))}/>
    <input aria-label="权益说明" placeholder="一句话说明（选填）" maxLength={200} value={benefit.detail} onChange={e=>setBenefit(v=>({...v,detail:e.target.value}))}/>
    <button className="secondary-button" disabled={busy||!benefit.title.trim()} onClick={()=>{onSaveBenefits([...benefits,{...benefit,title:benefit.title.trim(),detail:benefit.detail.trim()}]);setBenefit({title:'',detail:''});}}>刻上碑</button>
   </div>
  </div>}

  {isFounder&&<div className="sect-console-block">
   <div className="sect-console-label"><UserPlus size={13}/>加入方式</div>
   <div className="sect-policy-row">
    {Object.keys(POLICY_LABEL).map(k=><button key={k} className={`chip ${(sect.joinPolicy||'apply')===k?'on':''}`} disabled={busy} onClick={()=>onApi(`/api/sects/${sect.id}/join-policy`,{policy:k})}>
     {k==='open'?<Unlock size={12}/>:k==='invite'?<Lock size={12}/>:<UserPlus size={12}/>}{POLICY_LABEL[k]}
    </button>)}
   </div>
   <p className="sect-hint">开放加入：点一下就进门；申请制：掌门审核后入驻；邀请制：只接受掌门添加。</p>
  </div>}

  {canManage&&<div className="sect-console-block">
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
    <div><b>{a.name}</b>{a.message&&<p>“{a.message}”</p>}{a.inviterId&&<small>经邀请链接申请</small>}<small>{new Date(a.createdAt).toLocaleString('zh-CN',{hour12:false})}</small></div>
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
