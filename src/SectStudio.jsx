// 门派小镇布置面板（创始人可见）：预设卡 + 主题色 + 预览/发布。
import {useState} from 'react';
import {Check,Palette,Rocket,RotateCcw,Share2} from 'lucide-react';
import {TOWN_PRESETS,TOWN_THEMES,TERRAINS,TOWN_BUILDINGS,defaultLayout,presetOf,themeOf} from './world/townPresets.js';


export default function SectStudio({sect,busy,onPublish,onShare}){
 const draft=sect.townLayout||defaultLayout();
 const [picked,setPicked]=useState(null);           // null=跟随已发布；否则为草稿
 const [theme,setTheme]=useState(draft.theme||'jianghu');
 const current=picked?presetOf(picked).layout:{...draft,theme};
 const dirty=JSON.stringify({...current,theme})!==JSON.stringify({...draft,theme:draft.theme||'jianghu'});
 const applyPreset=id=>{setPicked(id);const p=presetOf(id).layout;setTheme(p.theme);};
 const publish=()=>onPublish({terrain:current.terrain,theme,buildings:current.buildings,elements:current.elements});
 return <div className="sect-studio">
  <h4>门派小镇 · 布置（仅创始人）</h4>
  <p className="sect-hint">选一套预设即可整体更换地形、建筑与陈设；主题色可单独挑。发布后，访客通过分享链接看到的就是你布置的样子。</p>
  <div className="sect-preset-grid">
   {TOWN_PRESETS.map(p=>{
    const active=(picked||draft.terrain||'village')===p.id&&(picked||draft.terrain||'village')===current.terrain;
    return <button key={p.id} className={`sect-preset ${active?'on':''}`} onClick={()=>applyPreset(p.id)} aria-pressed={active}>
     <span className="sect-preset-name">{p.name}</span>
     <span className="sect-preset-desc">{p.desc}</span>
     {active&&<Check size={14}/>}
    </button>;
   })}
  </div>
  <div className="sect-theme-row">
   <span className="sect-theme-label"><Palette size={13}/>主题色</span>
   {TOWN_THEMES.map(t=><button key={t.id} className={`sect-theme-dot ${theme===t.id?'on':''}`} style={{background:t.roof}} onClick={()=>setTheme(t.id)} aria-label={t.name} title={t.name}>{theme===t.id&&<Check size={13}/>}</button>)}
  </div>
  <div className="sect-studio-summary">
   <div><small>地形</small><b>{TERRAINS.find(t=>t.id===current.terrain)?.name}</b></div>
   <div><small>建筑</small><b>{current.buildings.map(b=>TOWN_BUILDINGS.find(x=>x.id===b)?.name||b).join(' · ')||'议事堂'}</b></div>
   <div><small>主题</small><b>{themeOf(theme).name}</b></div>
   <div><small>陈设</small><b>{(current.elements||[]).length} 件</b></div>
  </div>
  <div className="sect-studio-actions">
   <button className="primary-button" disabled={busy||!dirty} onClick={publish}><Rocket size={14}/>{busy?'发布中…':'发布小镇'}</button>
   <button className="secondary-button" disabled={busy||!dirty} onClick={()=>{setPicked(null);setTheme(draft.theme||'jianghu');}}><RotateCcw size={14}/>恢复默认</button>
   <button className="secondary-button" onClick={onShare}><Share2 size={13}/>分享链接</button>
  </div>
  {!dirty&&<p className="sect-hint">当前显示的就是已发布的样子。</p>}
 </div>;
}
