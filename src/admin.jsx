import {useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {Check,Undo2,FileText,RefreshCw,ShieldAlert,BadgeCheck,Ban,Search,ExternalLink} from 'lucide-react';

const TOKEN_KEY='atom-admin-token';
const STATUS_LABEL={草稿:'草稿',待审核:'待审核',已发布:'已发布',已撤回:'已撤回'};
const ACTION_LABEL={publish_edition:'发布赛事',withdraw_edition:'撤回赛事',publish_work:'发布作品',withdraw_work:'撤回作品',rollback_edition:'回滚赛事'};
const STATUS_STYLE={'已发布':'ok','已撤回':'bad','待审核':'wait','草稿':'wait'};

async function api(path,{method='GET',body}={}){
 const token=sessionStorage.getItem(TOKEN_KEY)||'';
 const response=await fetch(path,{method,headers:{'Content-Type':'application/json','x-atom-admin':token},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||`接口返回 ${response.status}`);
 return data;
}
function useAdminData(){
 const [editions,setEditions]=useState([]);
 const [audit,setAudit]=useState([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{
  setLoading(true);
  try{
   // 后台读取完整实时目录（含草稿与已撤回），公开目录只返回已发布。
   const [catalog,auditData]=await Promise.all([api('/api/admin/catalog'),api('/api/admin/audit')]);
   setEditions(catalog.editions);setAudit(auditData.items||[]);setError('');
  }catch(e){setError(e.message);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{reload();},[reload]);
 return {editions,audit,error,loading,reload};
}

function TokenGate({onSaved}){
 const [token,setToken]=useState(()=>sessionStorage.getItem(TOKEN_KEY)||'');
 const save=()=>{sessionStorage.setItem(TOKEN_KEY,token.trim());onSaved();};
 return <div className="gate">
  <div className="gate-card">
   <span className="eyebrow">原子江湖 · 运营后台</span>
   <h1>本地演示令牌</h1>
   <p>这是本地原型的写入层，不是生产权限系统。未配置 <code>ATOM_ADMIN_TOKEN</code> 时默认使用 <code>atom-local-demo</code>；令牌只保存在当前浏览器会话。</p>
   <div className="gate-row"><input value={token} onChange={e=>setToken(e.target.value)} placeholder="输入本地运营令牌" aria-label="本地运营令牌"/><button className="primary-button" onClick={save}>进入后台</button></div>
  </div>
 </div>;
}

function EditionsTab({editions,audit,onAction}){
 const [check,setCheck]=useState(null);
 const [busy,setBusy]=useState('');
 const run=async(label,fn)=>{setBusy(label);try{await fn();}catch(e){alert(e.message);}finally{setBusy('');}};
 const rollbackTargets=id=>audit.filter(e=>e.targetId===id&&e.action!=='rollback_edition').slice(0,5);
 return <div className="panel">
  <table className="grid">
   <thead><tr><th>赛事</th><th>阶段</th><th>发布状态</th><th>版本</th><th>作品</th><th>操作</th></tr></thead>
   <tbody>
    {editions.map(e=><tr key={e.id}>
     <td><strong>{e.title}</strong><small>{e.id} · {e.subtitle||''}</small></td>
     <td>{e.eventStage}</td>
     <td><span className={`tag ${STATUS_STYLE[e.publicationStatus]||''}`}>{STATUS_LABEL[e.publicationStatus]||e.publicationStatus}</span></td>
     <td>v{e.contentVersion}</td>
     <td>{e.works.length}</td>
     <td className="actions">
      <button disabled={!!busy} onClick={()=>run(`check-${e.id}`,async()=>{const r=await api('/api/admin/import-check');setCheck({editionId:e.id,report:r});})}><FileText size={14}/>导入检查</button>
      {e.publicationStatus!=='已发布'&&<button className="ok" disabled={!!busy} onClick={()=>run(`pub-${e.id}`,()=>onAction('edition/status',{id:e.id,status:'已发布',note:'运营后台发布'}))}><BadgeCheck size={14}/>发布</button>}
      {e.publicationStatus==='已发布'&&<button className="bad" disabled={!!busy} onClick={()=>run(`wd-${e.id}`,()=>onAction('edition/status',{id:e.id,status:'已撤回',note:'运营后台撤回'}))}><Ban size={14}/>撤回</button>}
      <select disabled={!!busy||!rollbackTargets(e.id).length} value="" onChange={ev=>{const v=ev.target.value;if(v)run(`rb-${e.id}`,()=>onAction('edition/rollback',{id:e.id,auditEventId:v}));}} aria-label={`回滚${e.title}`}>
       <option value="">回滚…</option>
       {rollbackTargets(e.id).map(a=><option key={a.id} value={a.id}>{new Date(a.time).toLocaleString('zh-CN',{hour12:false})} · {ACTION_LABEL[a.action]||a.action}</option>)}
      </select>
     </td>
    </tr>)}
   </tbody>
  </table>
  {check&&<div className="report">
   <header><h3>导入检查 · {check.editionId}</h3><button className="text-button" onClick={()=>setCheck(null)}>收起</button></header>
   {check.report.editions?.map(ed=><div key={ed.id} className="report-edition">
    <p><strong>{ed.id}</strong> · {ed.source||ed.error} · 新增 {check.report.totals.new} / 更新 {check.report.totals.updated} / 未变化 {check.report.totals.unchanged} / 缺失 {check.report.totals.missing}</p>
    <p className="muted">仅产出候选差异，不写任何状态；{ed.privateExcluded}</p>
    {(ed.items||[]).filter(i=>i.status!=='unchanged').slice(0,12).map(i=><p key={i.id} className={`diff ${i.status}`}>{i.status==='new'?'新增':i.status==='updated'?'更新':'缺失'} · {i.title} <small>{i.id}</small></p>)}
   </div>)}
  </div>}
 </div>;
}

function WorksTab({editions,onAction}){
 const [q,setQ]=useState(''),[edition,setEdition]=useState('all');
 const [busy,setBusy]=useState('');
 const rows=editions.filter(e=>edition==='all'||e.id===edition).flatMap(e=>e.works.map(w=>({...w,editionTitle:e.title})))
  .filter(w=>!q||`${w.title}${w.author}${w.track}`.toLowerCase().includes(q.toLowerCase()));
 const run=async(label,fn)=>{setBusy(label);try{await fn();}catch(e){alert(e.message);}finally{setBusy('');}};
 return <div className="panel">
  <div className="tools">
   <div className="search-field"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索作品、作者或赛道" aria-label="搜索作品"/></div>
   <select value={edition} onChange={e=>setEdition(e.target.value)} aria-label="筛选赛事"><option value="all">全部赛事</option>{editions.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select>
   <span className="muted">{rows.length} 条</span>
  </div>
  <table className="grid">
   <thead><tr><th>作品</th><th>赛事</th><th>赛道</th><th>作者</th><th>状态</th><th>操作</th></tr></thead>
   <tbody>
    {rows.map(w=><tr key={w.id}>
     <td><strong>{w.title}</strong><small>{w.id}</small></td>
     <td>{w.editionTitle}</td>
     <td>{w.track}</td>
     <td>{w.author}</td>
     <td><span className={`tag ${STATUS_STYLE[w.publicationStatus]||''}`}>{STATUS_LABEL[w.publicationStatus]||w.publicationStatus}</span></td>
     <td className="actions">
      {w.publicationStatus!=='已发布'&&<button className="ok" disabled={!!busy} onClick={()=>run(w.id,()=>onAction('work/status',{id:w.id,status:'已发布',note:'运营后台发布'}))}><BadgeCheck size={14}/>发布</button>}
      {w.publicationStatus==='已发布'&&<button className="bad" disabled={!!busy} onClick={()=>run(w.id,()=>onAction('work/status',{id:w.id,status:'已撤回',note:'运营后台撤回'}))}><Ban size={14}/>撤回</button>}
     </td>
    </tr>)}
   </tbody>
  </table>
 </div>;
}

function AuditTab({audit}){
 return <div className="panel">
  <table className="grid">
   <thead><tr><th>时间</th><th>操作</th><th>对象</th><th>操作者</th><th>变更</th><th>备注</th></tr></thead>
   <tbody>
    {audit.map(a=><tr key={a.id}>
     <td><small>{new Date(a.time).toLocaleString('zh-CN',{hour12:false})}</small></td>
     <td>{ACTION_LABEL[a.action]||a.action}</td>
     <td><small>{a.targetId}</small></td>
     <td>{a.actor}</td>
     <td><small>{a.before?.edition?`${STATUS_LABEL[a.before.edition.publicationStatus]} → ${STATUS_LABEL[a.after.edition.publicationStatus]}`:Object.keys(a.before?.works||{}).map(k=>`${STATUS_LABEL[a.before.works[k].publicationStatus]} → ${STATUS_LABEL[a.after.works[k].publicationStatus]}`).join('；')}</small></td>
     <td><small>{a.note}</small></td>
    </tr>)}
    {audit.length===0&&<tr><td colSpan={6} className="muted">还没有运营动作。发布或撤回后会在这里留下不可删除的记录。</td></tr>}
   </tbody>
  </table>
 </div>;
}

function OpsTab(){
 const [ops,setOps]=useState(null);
 const [opsError,setOpsError]=useState('');
 useEffect(()=>{
  let alive=true;
  const load=()=>api('/api/ops').then(d=>{if(alive){setOps(d);setOpsError('');}}).catch(e=>{if(alive)setOpsError(e.message);});
  load();const timer=setInterval(load,5000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 if(opsError)return <div className="panel"><p className="muted">{opsError}</p></div>;
 if(!ops)return <div className="panel"><p className="muted">读取中…</p></div>;
 const budget=ops.model?.budget||{};
 const level=budget.level==='stop'?'stop':budget.level==='warn'?'warn':'ok';
 return <div className="panel ops-panel">
  <div className="ops-grid">
   <section><h3>联机世界</h3><p><strong>{ops.world?.actorsOnline||0}</strong> 位侠客在线 · {ops.world?.actorsWaiting||0} 位排队 · {ops.world?.roomCount||0} 个房间</p><table className="grid"><thead><tr><th>房间</th><th>在线</th><th>等待</th><th>容量</th></tr></thead><tbody>{(ops.world?.rooms||[]).map(r=><tr key={r.id}><td>{r.name}<small>{r.id}</small></td><td>{r.online}</td><td>{r.waiting}</td><td>{r.capacity}</td></tr>)}</tbody></table></section>
   <section><h3>模型与预算</h3><p>状态：{ops.model?.configured?<span className="tag ok">已连接 {ops.model.model||''}</span>:<span className="tag wait">未配置（本地资料演示）</span>}</p><p>今日用量：{budget.calls||0} 次 · 费用 {budget.cost||0} / 上限 {budget.config?.dailyBudget||'不限'}</p><p>预算档位：<span className={`tag ${level}`}>{level==='stop'?'已达硬上限（暂停新调用）':level==='warn'?'接近上限（降级）':'正常'}</span></p><p>并发 {budget.active||0} / {budget.config?.maxConcurrent||3}</p></section>
   <section><h3>服务进程</h3><p>运行 {Math.round((ops.uptimeSec||0)/60)} 分钟 · 内存 {ops.memory?.rssMB||0}MB（堆 {ops.memory?.heapUsedMB||0}MB）</p><p className="muted">每 5 秒自动刷新。</p></section>
  </div>
 </div>;
}
function Admin(){
 const [authed,setAuthed]=useState(()=>!!sessionStorage.getItem(TOKEN_KEY));
 // 数据加载只在通过令牌门后挂载，避免无令牌请求把界面锁在错误状态。
 if(!authed)return <TokenGate onSaved={()=>setAuthed(true)}/>;
 return <AdminApp onExit={()=>setAuthed(false)}/>;
}
function AdminApp({onExit}){
 const [tab,setTab]=useState('editions');
 const [toast,setToast]=useState('');
 const {editions,audit,error,loading,reload}=useAdminData();
 const onAction=async(path,body)=>{
  await api('/api/admin/'+path,{method:'POST',body});
  setToast(`已完成：${ACTION_LABEL[path.includes('rollback')?'rollback_edition':path.includes('edition')?'publish_edition':'publish_work']||path}，世界将在 15 秒内更新`);
  setTimeout(()=>setToast(''),4000);
  reload();
 };
 return <div className="admin">
  <header>
   <span className="brand-seal">原<span>子</span></span>
   <div><h1>原子江湖 · 运营后台</h1><small>本地演示：发布、撤回、回滚与审计。生产权限系统尚未接入。</small></div>
   <nav>
    {[['editions','赛事管理'],['works','作品管理'],['ops','运行状态'],['audit','审计日志']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}
    <button className="text-button" onClick={()=>{sessionStorage.removeItem(TOKEN_KEY);onExit();}}>退出</button>
   </nav>
  </header>
  {error&&<div className="banner error"><ShieldAlert size={16}/>{error}（检查令牌或本地服务）<button className="text-button" onClick={reload}><RefreshCw size={14}/>重试</button></div>}
  {toast&&<div className="banner ok"><Check size={16}/>{toast}</div>}
  <main>
   {loading&&<p className="muted">读取中…</p>}
   {!loading&&tab==='editions'&&<EditionsTab editions={editions} audit={audit} onAction={onAction}/>}
   {!loading&&tab==='works'&&<WorksTab editions={editions} onAction={onAction}/>}
   {tab==='ops'&&<OpsTab/>}
   {!loading&&tab==='audit'&&<AuditTab audit={audit}/>}
  </main>
  <footer className="muted"><small>数据基线：src/data/editions.json（不可变）· 覆盖层：data/publication-overrides.json · 审计：data/audit-log.json · <a href="/" target="_blank" rel="norerer">打开原子江湖<ExternalLink size={12}/></a></small></footer>
 </div>;
}
createRoot(document.getElementById('admin-root')).render(<Admin/>);
