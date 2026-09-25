import {useState,useMemo,useRef,useEffect} from 'react';
import {apiUrl,worldWsUrl,missingWorldServer} from './net/endpoints.js';
import {ArrowUpRight,ArrowRight,Compass,BookOpen,MessageCircle,Sun,Moon,Settings2,Volume2,VolumeX,Plus,Minus,LocateFixed,RotateCcw,ChevronRight,ChevronLeft,Search,Bookmark,MapPin,Users,Send,Sparkles,Leaf,Footprints,Check,Trash2,SlidersHorizontal,ExternalLink,PanelRightClose,PanelRightOpen,X,Clock,Sparkle,Wifi,WifiOff,UserPlus,LogOut,ShieldOff,Coffee} from 'lucide-react';
import World from './world/World.jsx';
import {preloadModels} from './world/glb.js';
import OnlineWorld from './world/OnlineWorld.jsx';
import {OnlineClient} from './net/onlineClient.js';
import {WorldEngine} from './world/engine.js';
import {PLACES,AGENTS,THEMES,MAP_VERSION,SEATS} from './world/config.js';
import {demoReply} from './demo.mjs';
import {useCatalog} from './content/useCatalog.js';
import {allPublishedWorks} from './content/catalog.js';
import {SHARED_EXHIBITION,exhibitionZone,exhibitionZoneCount} from './content/exhibition.js';
import {readStore,writeStore,memoryFor} from './storage.js';
import Dialog from './Dialog.jsx';
const staticDemo=import.meta.env.VITE_STATIC_DEMO==='true';
// 小镇导览站点：品牌intro + 五处场所 + 入馆收尾。
const TOUR_STOPS=[
 {id:'intro',eyebrow:'原子江湖 · 导览',title:'山水有相逢，江湖有同路。',text:'原子公社是人与 Agent 共建的开源学习社区。这座小镇把社区的迎宾、交流、实践、学习与成果展示放进了五处场所。我带你逐一看看。'},
 {id:'tea',eyebrow:'第一站 · 相遇',title:'江湖茶楼',text:'一盏茶，遇见同路人。侠客们在此歇脚、闲聊、碰撞想法；你也可以随时邀请任何一位一对一私聊。'},
 {id:'workshop',eyebrow:'第二站 · 实践',title:'共创工坊',text:'把一个想法，做成一个作品。人提供经验与认知，Agent 协助整理与探索——务实求真，从能跑起来的原型开始。'},
 {id:'library',eyebrow:'第三站 · 学习',title:'开源书院',text:'分享是最好的学习。个体至上、开放共享、务实求真、互助共赢、持续进化——五个价值观是社区所有决策的基石。'},
 {id:'pavilion',eyebrow:'第四站 · 活动',title:'星火亭',text:'星星之火，从一次相遇开始。星火计划等真实赛事的介绍在此公布，参赛作品与结果资料核对后上线。'},
 {id:'hall',eyebrow:'第五站 · 成果',title:'武林大会展示馆',text:'每一份作品，都值得被看见。历届真实比赛的作品与作者介绍在这里陈列，可以阅读、收藏、分享，或请 AI 侠客陪你导览。'},
 {id:'end',eyebrow:'导览完成',title:'江湖路远，随时再来。',text:'小镇会因新作品、新朋友与新活动而变化。现在就进展馆看看大家的作品，或找位侠客聊聊吧。'},
];
const TOUR_FOCUS={tea:'tea',workshop:'workshop',library:'library',pavilion:'pavilion',hall:'hall'};
const assetUrl=path=>import.meta.env.BASE_URL+path.replace(/^\//,'');
const initialEvents=[{id:'welcome',text:'山门已开，欢迎来到原子江湖',kind:'welcome',time:Date.now()}];
function useSaved(key,fallback){const [v,set]=useState(()=>readStore(key,fallback));const update=n=>set(prev=>{const next=typeof n==='function'?n(prev):n;writeStore(key,next);return next;});return [v,update];}
const Avatar=({agent,size=36})=><span className="avatar" style={{'--avatar-color':agent?.color||'#427ab5',width:size,height:size}}><span className="avatar-hat"/><span className="avatar-eyes">••</span></span>;
function FollowsTab({account,follows,onlinePlayers,aiPresence,onToggle,onLogin}){
 if(!account)return <div className="empty-state"><Users/><h3>登录后查看关注</h3><p>关注按账号保存，换设备也能看到。</p><button className="primary-button" onClick={onLogin}>登录名帖</button></div>;
 const aiFollows=follows.filter(f=>f.targetType==='ai');
 const playerFollows=follows.filter(f=>f.targetType==='player');
 if(!follows.length)return <div className="empty-state"><Users/><h3>还没有关注任何侠客</h3><p>在联机名帖或"同行侠客"面板里点"关注"，就能在这里找到他们。</p></div>;
 return <div className="follows-list">
  {aiFollows.length>0&&<><h4>AI 侠客</h4>{aiFollows.map(f=>{const a=AGENTS.find(x=>x.id===f.targetId);if(!a)return null;const presence=aiPresence?.[f.targetId];const latest=(presence?.recent||[]).at(-1)||(presence?.views||[])[0]?.impression||'';return <article key={f.targetId}><Avatar agent={a} size={40}/><div><small>AI 侠客 · {a.role}</small><p>{a.name}</p>{latest&&<small className="follow-latest">最近：{latest}</small>}</div><button className="secondary-button" onClick={()=>onToggle('ai',a.id)}>取消关注</button></article>;})}</>}
  {playerFollows.length>0&&<><h4>联机侠客</h4>{playerFollows.map(f=>{const online=onlinePlayers.find(p=>p.id===f.targetId);return <article key={f.targetId}><Avatar agent={{color:online?.color||'#427ab5'}} size={40}/><div><small>{online?'在线 · '+online.name:'当前离线'}</small><p>{online?.name||'联机侠客'}</p>{online&&online.state&&<small className="follow-latest">{online.seat?'正在茶楼小坐':'此刻：'+online.state}</small>}</div><button className="secondary-button" onClick={()=>onToggle('player',f.targetId)}>取消关注</button></article>;})}</>}
 </div>;
}
export default function App(){
 const [events,setEvents]=useState(initialEvents),engine=useMemo(()=>new WorldEngine(e=>setEvents(p=>[e,...p].slice(0,12))),[]),[agents,setAgents]=useState(()=>engine.snapshot());
 const [theme,setTheme]=useSaved('theme','jianghu'),[night,setNight]=useSaved('night',false),[nickname,setNickname]=useSaved('nickname','初来江湖的你'),[playerColor,setPlayerColor]=useSaved('color','#427ab5');
 const [bookmarks,setBookmarks]=useSaved('bookmarks',[]),[remember,setRemember]=useSaved('remember',false),[visits,setVisits]=useSaved('visits',[]);
 const [panel,setPanel]=useState(null),[location,setLocation]=useState('town'),[placeId,setPlaceId]=useState(null),[chatId,setChatId]=useState(null),[editionId,setEditionId]=useState('funskills'),[track,setTrack]=useState('全部'),[search,setSearch]=useState(''),[workId,setWorkId]=useState(null),[journalTab,setJournalTab]=useState('收藏作品'),[toast,setToast]=useState(''),[showLabels,setShowLabels]=useState(true),[rail,setRail]=useState(true),[mode,setMode]=useState('demo'),[draft,setDraft]=useState(''),[messages,setMessages]=useState({}),[sending,setSending]=useState(false),[phase,setPhase]=useState(()=>engine.phase().name),[guideOpen,setGuideOpen]=useState(false),[guideDraft,setGuideDraft]=useState(''),[guideMessages,setGuideMessages]=useState([]),[guideSending,setGuideSending]=useState(false),[sheet,setSheet]=useState(false);
 const catalogState=useCatalog({staticDemo}),exhibition=catalogState.exhibition?.config||SHARED_EXHIBITION;
 // 实时已发布作品（接口优先、快照兜底）：3D 展位、AI 观展目标都只读取发布状态为“已发布”的数据，
 // 运营在后台撤回后各入口一致生效。
 const liveWorks=useMemo(()=>catalogState.catalog?catalogState.catalog.editions.flatMap(e=>e.works):allPublishedWorks(),[catalogState.catalog]);
 useEffect(()=>{engine.setWorks(liveWorks);},[engine,liveWorks]);
 const editions=useMemo(()=>catalogState.catalog?catalogState.catalog.editions.map(e=>({...e,works:e.works.map(w=>({...w,poster:assetUrl(w.poster),thumb:assetUrl(w.thumb)}))})):[],[catalogState.catalog]);
 const allWorks=useMemo(()=>editions.flatMap(e=>e.works),[editions]);
 const zoneWorks=useMemo(()=>exhibitionZone(exhibition,0,liveWorks),[exhibition,liveWorks]);
 const sceneWorks=useMemo(()=>zoneWorks.map(w=>({...w,poster:assetUrl(w.poster),thumb:assetUrl(w.thumb)})),[zoneWorks]);
 const exhibitedIds=useMemo(()=>new Set(zoneWorks.map(w=>w.id)),[zoneWorks]);
 const zoneCount=exhibitionZoneCount(exhibition,liveWorks);
 useEffect(()=>{engine.player.name=nickname==='初来江湖的你'?'你':nickname||'你';},[nickname,engine]);
 useEffect(()=>{const t=setInterval(()=>setPhase(engine.phase().name),4000);return()=>clearInterval(t);},[engine]);
 const apiRef=useRef(),abortRef=useRef(),chatScroll=useRef(),toastTimer=useRef(),memoryRev=useRef(0);
 // 联机世界：账号身份由服务端会话令牌决定（注册/登录后进入），不是生产鉴权体系。
 const [world,setWorld]=useSaved('world','demo');
 const [room,setRoom]=useSaved('room','jianghu');
 const [rooms,setRooms]=useState([]);
 const [account,setAccount]=useState(null);
 const [authOpen,setAuthOpen]=useState(false);
 const [authMode,setAuthMode]=useState('register');
 const [authProvider,setAuthProvider]=useState('local');
 const [externalToken,setExternalToken]=useState('');
 const [authForm,setAuthForm]=useState({name:'',password:'',color:'#427ab5'});
 const [authError,setAuthError]=useState('');
 const [authBusy,setAuthBusy]=useState(false);
 const [onlineState,setOnlineState]=useState('idle');
 const [queue,setQueue]=useState(null);
 const [onlinePlayers,setOnlinePlayers]=useState([]);
 const [onlineActivity,setOnlineActivity]=useState([]);
 // AI 侠客见闻（联机）：id → {recent:[...],views:[...]}，来自服务端低频 presence 广播。
 const [aiPresence,setAiPresence]=useState({});
 const [invite,setInvite]=useState(null);
 const [conversation,setConversation]=useState(null);
 const [onlineMessages,setOnlineMessages]=useState([]);
 const [onlineDraft,setOnlineDraft]=useState('');
 const [aiMode,setAiMode]=useState('demo');
 const [actorCard,setActorCard]=useState(null);
 const [blocked,setBlocked]=useSaved('blocked',[]);
 const [profileDraft,setProfileDraft]=useState({name:'',color:'#427ab5'});
 // 房间占用列表（公开信息：在线/等待/容量）。
 useEffect(()=>{
  if(world!=='online'||staticDemo)return;
  let alive=true;
  const load=()=>fetch(apiUrl('/api/rooms')).then(r=>r.ok?r.json():null).then(d=>{if(alive&&d?.rooms)setRooms(d.rooms);}).catch(()=>{});
  load();const timer=setInterval(load,10000);
  return()=>{alive=false;clearInterval(timer);};
 },[world,staticDemo]);
 // 私人记忆保存在账号里（服务端），按 (账号, 角色) 隔离。
 const [memories,setMemories]=useState([]);
 // 关注关系（服务端，按账号隔离；player 与 ai 分开）。
 const [follows,setFollows]=useState([]);
 // 茶楼共坐：全房间座位占用与我的座位。
 const [seats,setSeats]=useState([]);
 const [mySeat,setMySeat]=useState(null);
 const [memoryOffer,setMemoryOffer]=useState(null);
 // 首访引导：首次进入显示三步（移动/看展/区分真人AI），可跳过，仅一次。
 const [onboard,setOnboard]=useState(()=>!readStore('onboarded',false)?1:0);
 // 小镇导览：脚本化游览，-1 表示未开始。
 const [tour,setTour]=useState(-1);
 const clientRef=useRef(null);
 // GLB 资产预载：清单为空时瞬间通过；有模型时在进入场景前加载完（失败回退程序化）。
 const [assetsReady,setAssetsReady]=useState(false);
 useEffect(()=>{let alive=true;preloadModels().then(()=>{if(alive)setAssetsReady(true);});return()=>{alive=false;};},[]);
 // 登录后读取账号记忆；若检测到本机旧记忆，提供迁移选择（不静默归入新账号）。
 useEffect(()=>{
  if(!account){setMemories([]);setFollows([]);return;}
  let alive=true;
  fetch(apiUrl(`/api/memories?token=${encodeURIComponent(account.token)}&agentId=`)).then(r=>r.ok?r.json():null).then(d=>{
   if(!alive)return;
   setMemories(d?.items||[]);
   const local=readStore('memories',[]);
   if(Array.isArray(local)&&local.length)setMemoryOffer(local);
  }).catch(()=>{});
  fetch(apiUrl(`/api/follows?token=${encodeURIComponent(account.token)}`)).then(r=>r.ok?r.json():null).then(d=>{if(alive)setFollows(d?.items||[]);}).catch(()=>{});
  return()=>{alive=false;};
 },[account]);
 // 鉴权模式：local（本地注册）或 external（社区账号体系）。
 useEffect(()=>{if(staticDemo)return;fetch(apiUrl('/api/auth/config')).then(r=>r.ok?r.json():null).then(d=>{if(d?.mode)setAuthProvider(d.mode);}).catch(()=>{});},[staticDemo]);
 // 恢复登录态：令牌无效时清理。
 useEffect(()=>{
  const token=readStore('authToken','');
  if(!token||staticDemo)return;
  let alive=true;
  fetch(apiUrl('/api/auth/me?token='+encodeURIComponent(token))).then(r=>r.ok?r.json():null).then(d=>{
   if(!alive)return;
   if(d?.user)setAccount({...d.user,token});else writeStore('authToken','');
  }).catch(()=>{});
  return()=>{alive=false;};
 },[]);
 async function submitAuth(){
  setAuthBusy(true);setAuthError('');
  try{
   const r=await fetch(apiUrl(authMode==='register'?'/api/auth/register':'/api/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(authForm)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'操作失败');
   writeStore('authToken',d.token);
   setAccount({...d.user,token:d.token});
   setAuthOpen(false);{const warn=missingWorldServer();if(warn)notice(warn);}setWorld('online');
   notice(`欢迎来到联机江湖，${d.user.name}`);
  }catch(e){setAuthError(e.message);}
  finally{setAuthBusy(false);}
 }
 async function submitExternal(){
  setAuthBusy(true);setAuthError('');
  try{
   const r=await fetch(apiUrl('/api/auth/external'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:externalToken.trim()})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'社区账号验证失败');
   writeStore('authToken',d.token);
   setAccount({...d.user,token:d.token});
   setAuthOpen(false);{const warn=missingWorldServer();if(warn)notice(warn);}setWorld('online');
   notice(`欢迎来到联机江湖，${d.user.name}`);
  }catch(e){setAuthError(e.message);}
  finally{setAuthBusy(false);}
 }
 async function logout(){
  try{await fetch(apiUrl('/api/auth/logout'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account?.token||''})});}catch{}
  writeStore('authToken','');setAccount(null);setWorld('demo');notice('已退出登录，回到本地演示');
 }
 async function saveProfile(){
  const name=profileDraft.name.trim()||'少侠';
  if(account){
   try{
    const r=await fetch(apiUrl('/api/auth/profile'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account.token,name,color:profileDraft.color})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'保存失败');
    setAccount(a=>({...a,...d.user}));
    clientRef.current?.syncProfile(account.token);
    notice('名帖已更新');
   }catch(e){notice(e.message);}
  }else{setNickname(name);setPlayerColor(profileDraft.color);notice('本地形象已更新');}
 }
 useEffect(()=>{
  if(world!=='online'||staticDemo||!account)return;
  const client=new OnlineClient({url:worldWsUrl(),token:account.token,room,handlers:{
   onOpen:()=>setOnlineState('connecting'),
   onWelcome:d=>{setQueue(null);setOnlineState('online');if(d.activity?.length)setOnlineActivity(d.activity);if(d.presence){const map=Object.fromEntries(d.presence.map(p=>[p.id,p]));window.__atomOnlinePresence=map;setAiPresence(map);}notice('已进入联机世界，点击地面行走');},
   onRoomQueued:d=>{setQueue({position:d.position,waiting:d.waiting});setOnlineState('queued');notice(`房间已满（${d.capacity} 位），你排在第 ${d.position} 位`);},
   onQueuePosition:d=>setQueue(q=>({position:d.position,waiting:d.waiting})),
   onQueueLeft:()=>{setQueue(null);setOnlineState('idle');setWorld('demo');notice('已取消排队，回到本地演示');},
   onActivity:d=>setOnlineActivity(d.events||[]),
   onPresence:d=>{const map=Object.fromEntries((d.agents||[]).map(p=>[p.id,p]));window.__atomOnlinePresence=map;setAiPresence(map);},
   onEmote:d=>{window.__atomOnlineEmotes=[d,...(window.__atomOnlineEmotes||[])].slice(0,5);},
   onSeats:d=>setSeats(d.seats||[]),
   onSitOk:d=>{setMySeat(d.seat?.id||null);notice('已入座，附近的侠客能看到你');},
   onSitReject:d=>notice({already:'你已经入座了',occupied:'这个位置有人了',far:'请先走到茶楼附近',missing:'位置不存在'}[d.reason]||'入座未成功'),
   onStandOk:()=>{setMySeat(null);notice('已起身');},
   onAuthRequired:()=>{setOnlineState('idle');setWorld('demo');writeStore('authToken','');setAccount(null);notice('登录状态已失效，请重新登录');},
   onClose:()=>setOnlineState(s=>s==='taken-over'?s:'offline'),
   onTakenOver:()=>{setOnlineState('taken-over');notice('同一账号已在其他标签页接入，本页停止控制');},
   onRoomFull:()=>{setOnlineState('full');notice('房间已满（20 位），请稍后再来');},
   onChatInvited:d=>setInvite(d),
   onChatStart:d=>{setConversation(d.with);setOnlineMessages([]);setAiMode('demo');setInvite(null);notice(`已与${d.with.name}开始私聊`);},
   onChatMsg:d=>{setOnlineMessages(m=>[...m,{role:'them',text:d.text,id:d.id,workIds:d.workIds||[],ai:d.ai}]);if(d.ai&&d.mode)setAiMode(d.mode);},
   onChatAck:d=>setOnlineMessages(m=>m.map(x=>x.id===d.id?{...x,sent:true}:x)),
   onChatEnd:()=>{setConversation(null);notice('会话已结束');},
   onChatRejected:()=>notice('对方拒绝了邀请'),
   onInviteFailed:d=>notice('邀请未成功：'+({offline:'对方不在线',busy:'对方正忙',blocked:'对方已屏蔽你',pending:'已有进行中的邀请',expired:'邀请已过期'}[d.reason]||d.reason||'未知原因')),
   onInviteExpired:()=>notice('邀请已过期'),
   onError:d=>notice(d.message||'联机出现错误'),
  }});
  clientRef.current=client;client.connect();
  return()=>{client.close();clientRef.current=null;setOnlineState('idle');setQueue(null);setOnlinePlayers([]);setOnlineActivity([]);setInvite(null);setConversation(null);setActorCard(null);};
 },[world,staticDemo,account,room]);
 const currentEdition=editions.find(e=>e.id===editionId)||editions[0]||null,work=allWorks.find(w=>w.id===workId),place=PLACES.find(p=>p.id===placeId),chatAgent=AGENTS.find(a=>a.id===chatId);
 const filtered=useMemo(()=>(currentEdition?currentEdition.works:[]).filter(w=>(track==='全部'||w.track===track)&&(!search||`${w.title}${w.author}${w.description}${w.tags.join('')}`.toLowerCase().includes(search.toLowerCase()))),[currentEdition,track,search]);
 // 茶桌同桌：同一张桌子（tea-a* / tea-b*）上的其他人，入座后可一键相邀。
 const tableMates=mySeat?seats.filter(x=>x.seat!==mySeat&&x.seat.slice(0,5)===mySeat.slice(0,5)):[];
 const mySeatDef=mySeat?SEATS.find(s=>s.id===mySeat):null;
 function notice(text){setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3500);}
 useEffect(()=>{if(!staticDemo)fetch(apiUrl('/api/status')).then(r=>r.ok?r.json():null).then(d=>{if(d)setMode(d.mode);}).catch(()=>{});return()=>{clearTimeout(toastTimer.current);abortRef.current?.abort();};},[]);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('work');const w=allWorks.find(w=>w.id===id);if(w){setEditionId(w.editionId);setLocation('hall');setPanel('gallery');setWorkId(id);}else setWorkId(null);},[allWorks]);
 useEffect(()=>{if(catalogState.source==='snapshot-fallback')notice('内容接口暂不可用，已切换本地内容快照，作品阅读不受影响');else if(catalogState.exhibition?.mismatch)notice('展陈布局版本与内容服务不一致，请刷新或联系运营核对');},[catalogState.source,catalogState.exhibition?.mismatch]);
 useEffect(()=>{if(chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight;},[messages,sending]);
 useEffect(()=>{function nav(){const id=new URLSearchParams(window.location.search).get('work');setWorkId(allWorks.some(w=>w.id===id)?id:null);}window.addEventListener('popstate',nav);return()=>window.removeEventListener('popstate',nav);},[]);
 function closeChat(){abortRef.current?.abort();setSending(false);if(chatId)engine.release(chatId);setChatId(null);setPanel(null);setDraft('');}
 function closePanel(){if(panel==='chat')closeChat();else setPanel(null);}
 function openPanel(id){if(chatId)closeChat();if(id==='settings')setProfileDraft({name:account?account.name:(nickname==='初来江湖的你'?'':nickname),color:account?account.color:playerColor});setPanel(id);}
 function enterHall(){if(chatId)closeChat();setLocation('hall');setPanel('gallery');setPlaceId(null);notice('已进入武林大会展示馆');}
 function openWork(id){const w=allWorks.find(w=>w.id===id);if(!w)return;setWorkId(id);const url=new URL(window.location.href);url.searchParams.set('work',id);history.pushState({},'',url);setVisits(v=>[{id,time:Date.now()},...v.filter(x=>x.id!==id)].slice(0,50));}
 function closeWork(){setWorkId(null);const url=new URL(window.location.href);url.searchParams.delete('work');history.replaceState({},'',url);}
 function toggleBookmark(id){setBookmarks(v=>v.includes(id)?v.filter(x=>x!==id):[id,...v]);}
 function isFollowing(type,id){return follows.some(f=>f.targetType===type&&f.targetId===id);}
 async function toggleFollow(type,id){
  if(!account){setAuthMode('login');setAuthError('');setAuthOpen(true);notice('关注需要先登录名帖');return;}
  const wasFollowing=isFollowing(type,id);
  try{
   const r=await fetch(apiUrl(wasFollowing?'/api/follows/remove':'/api/follows'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account.token,targetType:type,targetId:id})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'操作失败');
   setFollows(v=>wasFollowing?v.filter(f=>!(f.targetType===type&&f.targetId===id)):[{targetType:type,targetId:id,createdAt:Date.now()},...v]);
   notice(wasFollowing?'已取消关注':'已关注');
  }catch(e){notice(e.message);}
 }
 function startTour(){if(chatId)closeChat();setPanel(null);setTour(0);}
 function tourGo(step){
  const next=Math.max(0,Math.min(TOUR_STOPS.length-1,step));
  setTour(next);
  const stop=TOUR_STOPS[next];
  const focus=TOUR_FOCUS[stop.id];
  if(focus)apiRef.current?.focus(focus);
 }
 function endTour(){setTour(-1);notice('导览已结束，随时可以重新开始');}
 function startChat(id){if(!account){setAuthMode('login');setAuthError('');setAuthOpen(true);notice('与侠客私聊需要先登录名帖');return;}if(chatId)closeChat();engine.hold(id);setChatId(id);setPanel('chat');setMessages(v=>({...v,[id]:v[id]||[{role:'assistant',content:AGENTS.find(a=>a.id===id).line}]}));setDraft('');}
 function openPlace(id){setPlaceId(id);openPanel('place');}
 async function sendMessage(text=draft){text=text.trim();if(!text||sending||!chatId)return;const id=chatId,rev=memoryRev.current;const historyMessages=messages[id]||[];const liveIds=new Set(liveWorks.map(w=>w.id));const observations=(agents.find(a=>a.id===id)?.views||[]).filter(v=>liveIds.has(v.workId)).map(v=>({workId:v.workId,title:v.title,tagline:v.tagline,impression:v.impression,opinion:v.opinion}));setDraft('');setSending(true);setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'user',content:text}]}));const controller=new AbortController();abortRef.current=controller;
  try{let d;if(staticDemo){d=demoReply({message:text,agentId:id,memories:remember?memoryFor(memories,id):[],observations});}else{const r=await fetch(apiUrl('/api/chat'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,agentId:id,token:account?.token||'',history:historyMessages,observations}),signal:controller.signal});d=await r.json();if(!r.ok)throw new Error(d.error||'暂时无法回复');}if(controller.signal.aborted||rev!==memoryRev.current)return;setMode(d.mode);setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'assistant',content:d.text,workIds:d.workIds}]}));
   // 用户主动开启并主动表达兴趣时才保存；记忆写入账号（服务端），不写入浏览器。
   if(remember&&account&&/我.*(喜欢|感兴趣|想学|在做)|记住/.test(text)){fetch(apiUrl('/api/memories'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account.token,agentId:id,text,source:'你主动表达的兴趣'})}).then(r=>r.ok?r.json():null).then(saved=>{if(saved?.entry)setMemories(v=>[saved.entry,...v].slice(0,60));}).catch(()=>{});}
  }catch(e){if(e.name!=='AbortError')setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'assistant',content:e.message,error:true}]}));}finally{if(abortRef.current===controller)setSending(false);}
 }
 function deleteMemory(id){memoryRev.current++;abortRef.current?.abort();setSending(false);setMessages({});if(account){const path=id?`/api/memories/delete`:`/api/memories/clear`;fetch(apiUrl(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{token:account.token,id}:{token:account.token,agentId:chatId||''})}).then(r=>r.ok?r.json():null).then(d=>{if(d)setMemories(m=>id?m.filter(x=>x.id!==id):[]);}).catch(()=>{});}else setMemories(m=>id?m.filter(x=>x.id!==id):[]);notice(id?'记忆已删除，相关对话上下文已清除':'所有私人记忆与对话上下文已清除');}
 function changeRemember(value){memoryRev.current++;abortRef.current?.abort();setSending(false);setRemember(value);setMessages({});}
 async function share(){try{await navigator.clipboard.writeText(window.location.href);notice('作品链接已复制');}catch{notice('可复制地址栏中的作品链接');}}
 function workCard(w){return <button className="work-card" key={w.id} onClick={()=>openWork(w.id)}><div className="work-image"><img src={w.thumb} alt={w.title} loading="lazy"/><span style={{boxShadow:`inset 3px 0 ${(currentEdition?.trackColors||{})[w.track]||'transparent'}`}}>{w.track}</span>{exhibitedIds.has(w.id)&&<span className="exhibiting-badge">展陈中</span>}{bookmarks.includes(w.id)&&<Bookmark size={17} fill="currentColor"/>}</div><div className="work-copy"><h3>{w.title}</h3><p>{w.tagline}</p><footer><span>{w.author}</span><ArrowUpRight size={16}/></footer></div></button>;}
 if(catalogState.status!=='ready'||!assetsReady)return <div className={`app booting ${night?'night':''}`}><div className="boot-card"><span className="boot-brand"><img src={assetUrl(night?'/brand/atomhub-lockup-white.png':'/brand/atomhub-lockup-black.png')} alt="原子公社 AtomHub 官方标识"/><span className="boot-seal">原<span>子</span></span></span><h1>原子江湖</h1><p>{catalogState.status==='ready'?'正在载入角色模型…':'正在读取已发布的赛事与作品…'}</p></div></div>;
 return <div className={`app ${night?'night':''}`}>
  <header className="topbar">
   <button className="brand" onClick={()=>{closePanel();setLocation('town');apiRef.current?.reset();}} aria-label="回到原子江湖"><span className="brand-seal">原<span>子</span></span><span className="brand-word">原子江湖<small>ATOMHUB · A LIVING WORLD</small></span></button>
   <nav aria-label="主导航"><button className={location==='town'&&!['journal','about'].includes(panel)?'active':''} onClick={()=>{closePanel();setLocation('town');}}><Compass size={17}/>漫游小镇</button><button className={location==='hall'?'active':''} onClick={enterHall}><BookOpen size={17}/>武林大会</button><button className={panel==='journal'?'active':''} onClick={()=>openPanel('journal')}><Bookmark size={16}/>游历手札{bookmarks.length>0&&<b>{bookmarks.length}</b>}</button></nav>
   <div className="top-actions">{staticDemo?<span className="world-status"><i/>本地世界</span>:<button className={`world-status mode-switch ${world}`} onClick={()=>{if(world==='online'){setWorld('demo');return;}if(!account){setAuthMode('register');setAuthForm({name:nickname==='初来江湖的你'?'':nickname,password:'',color:playerColor});setAuthError('');setAuthOpen(true);return;}{const warn=missingWorldServer();if(warn)notice(warn);}setWorld('online');}} aria-label="切换世界模式">{world==='online'?<><Wifi size={13}/>{onlineState==='online'?'联机世界':onlineState==='queued'?`排队中 ${queue?.position||1}`:onlineState==='connecting'?'连接中…':onlineState==='taken-over'?'已被接管':'重连中…'}</>:<><WifiOff size={13}/>{account?'进入联机':'登录进入联机'}</>}</button>}<button className="profile-button" onClick={()=>openPanel('settings')} aria-label="定制我的侠客"><Avatar size={34}/><span>{account?account.name:nickname==='初来江湖的你'?'少侠':nickname}</span><ChevronRight size={14}/></button></div>
  </header>
  <main className={`world-layout ${rail?'':'rail-hidden'}`}>
   <div className="world-stage">
    {world==='online'&&!staticDemo
     ?<OnlineWorld client={clientRef.current} theme={theme} night={night} labels={showLabels} playerColor={account?.color||playerColor} onPlayers={players=>{window.__atomOnlinePlayers=players;setOnlinePlayers(players.filter(p=>!blocked.includes(p.id)));}} onPlace={openPlace} onActor={setActorCard} apiRef={apiRef}/>
     :<World engine={engine} theme={theme} night={night} location={location} works={sceneWorks} onPlace={openPlace} onAgent={startChat} onWork={openWork} onSnapshot={setAgents} apiRef={apiRef} playerColor={playerColor} labels={showLabels}/>}
    <div className="scene-intro"><span className="eyebrow"><span className="tiny-star">✳</span> 人与 AGENT 共建的开源学习社区</span><h1>{world==='online'&&!staticDemo?'山水有相逢，同路在联机。':location==='town'?'山水有相逢，江湖有同路。':'让每一个好想法，被看见。'}</h1><p>{world==='online'&&!staticDemo?'这是服务端权威的联机世界：点击地面行走，邀请遇到的侠客一对一私聊。':location==='town'?'在这里歇歇脚，聊聊想法，和有趣的灵魂一起创造。':'走近展台，发现来自真实赛事的作品与创作者。'}</p></div>
    <div className="scene-weather">{night?<Moon size={17}/>:<Sun size={18}/>}<span>{phase}<small>{night?'灯火可亲 · 夜景':'草木葱茏 · 日景'}</small></span></div>
    {location==='hall'&&<button className="back-to-town" onClick={()=>{setLocation('town');closePanel();}}><ChevronLeft size={16}/>返回小镇</button>}
    <div className="map-caption"><div className="compass-mark"><span>N</span><Compass size={37} strokeWidth={1}/></div><div><span className="eyebrow">{location==='hall'?'THE EXHIBITION HALL':world==='online'&&!staticDemo?'THE ONLINE WORLD':'THE ATOM VILLAGE'}</span><h2>{location==='hall'?'武林大会 · 灵感长廊':world==='online'&&!staticDemo?'原子公社 · 联机江湖':'原子公社 · 江湖初见'}</h2><p><MapPin size={13}/>{location==='hall'?'比赛展示馆':'原子广场'}<span>·</span>{location==='hall'?`${filtered.length} 份作品可供探索`:world==='online'&&!staticDemo?`${onlinePlayers.length+1} 位侠客在此相聚`:'8 位 AI 侠客在此生活'}</p></div></div>
    <div className="world-tools"><button aria-label="放大地图" onClick={()=>apiRef.current?.zoom(.85)}><Plus size={18}/></button><button aria-label="缩小地图" onClick={()=>apiRef.current?.zoom(1.15)}><Minus size={18}/></button><span/><button aria-label="回到我的角色" onClick={()=>apiRef.current?.locate()}><LocateFixed size={18}/></button><button aria-label="重置视角" onClick={()=>apiRef.current?.reset()}><RotateCcw size={17}/></button><span/><button aria-label={night?'切换日景':'切换夜景'} onClick={()=>setNight(v=>!v)}>{night?<Sun size={18}/>:<Moon size={18}/>}</button><button aria-label="小镇设置" onClick={()=>openPanel('settings')}><Settings2 size={18}/></button></div>
    <div className="controls-tip"><span className="mouse-icon"/>点击地面行走<span>·</span>拖动旋转<span>·</span>滚轮缩放</div>
    {world==='online'&&!staticDemo&&<div className="emote-bar" role="group" aria-label="表情招呼">{[['wave','打招呼','👋'],['bow','作揖','🙇'],['clap','鼓掌','👏'],['think','思考','🤔']].map(([kind,label,icon])=><button key={kind} title={label} aria-label={label} onClick={()=>{clientRef.current?.emote(kind);notice(`你向附近的侠客${label}`);}}><span aria-hidden="true">{icon}</span></button>)}</div>}
    {onboard>0&&<div className="onboard-card" role="dialog" aria-label="首访引导">
     <span className="eyebrow">初入江湖 · 第 {onboard} / 3 步</span>
     <h3>{['点击地面，少侠即刻前行','走进武林大会展示馆，阅读真实赛事作品','名帖带 AI 徽标的是 AI 侠客，其余是同在联机的真人'][onboard-1]}</h3>
     <p>{['也可以拖动旋转视角、滚轮缩放，从不同角度看看这座小镇。','馆内收录繁星之夜、数智星光展等真实比赛的作品与作者介绍。','联机世界里，你和社区的朋友都以侠客形象在此相聚。'][onboard-1]}</p>
     <div className="onboard-actions">
      <button className="text-button" onClick={()=>{writeStore('onboarded',true);setOnboard(0);}}>跳过引导</button>
      <button className="primary-button" onClick={()=>{if(onboard>=3){writeStore('onboarded',true);setOnboard(0);}else setOnboard(onboard+1);}}>{onboard>=3?'开始漫游':'下一步'}<ArrowRight size={15}/></button>
     </div>
     <span className="onboard-dots">{[1,2,3].map(i=><i key={i} className={i<=onboard?'on':''}/>)}</span>
    </div>}
    {tour>=0&&<div className="tour-card" role="dialog" aria-label="小镇导览">
     <span className="eyebrow">{TOUR_STOPS[tour].eyebrow} · {tour+1} / {TOUR_STOPS.length}</span>
     <h3>{TOUR_STOPS[tour].title}</h3>
     <p>{TOUR_STOPS[tour].text}</p>
     <div className="tour-actions">
      <button className="text-button" onClick={endTour}>结束导览</button>
      <div className="tour-nav">
       <button className="secondary-button" disabled={tour===0} onClick={()=>tourGo(tour-1)}>上一站</button>
       {tour<TOUR_STOPS.length-1
        ?<button className="primary-button" onClick={()=>tourGo(tour+1)}>下一站<ArrowRight size={15}/></button>
        :<button className="primary-button" onClick={()=>{endTour();enterHall();}}>进入展示馆<ArrowUpRight size={17}/></button>}
      </div>
     </div>
     <span className="tour-dots">{TOUR_STOPS.map((s2,i)=><i key={s2.id} className={i<=tour?'on':''}/>)}</span>
    </div>}
   </div>
   <button className="rail-toggle icon-button" aria-label={rail?'收起侧栏':'展开侧栏'} onClick={()=>setRail(v=>!v)}>{rail?<PanelRightClose size={18}/>:<PanelRightOpen size={18}/>}</button>
  {rail&&<aside className={`right-rail${sheet?' sheet-open':''}`}>
   <button className="sheet-handle" aria-label={sheet?'收起底部面板':'展开底部面板'} onClick={()=>setSheet(v=>!v)}><span/>{sheet?'收起':'展开'}</button>
   {world==='online'&&!staticDemo?<>
    {onlineState==='queued'&&queue&&<section className="welcome-card queue-card"><span className="eyebrow">房间已满 · 排队中</span><h2>江湖火热，<br/>敬请稍候<span>。</span></h2><div className="hero-art"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社白蓝斗笠侠客 IP"/><span className="ip-note">原子公社 · 原创 IP</span></div><p>你排在第 <strong>{queue.position}</strong> 位（当前 {queue.waiting} 人等待，房间容量 20）。有空位时会自动进入，无需刷新。</p><button className="secondary-button" onClick={()=>clientRef.current?.leaveQueue()}>取消排队</button></section>}
    <section className="welcome-card"><span className="eyebrow">联机世界 · 服务端权威</span><h2>相逢在<br/>联机江湖<span>。</span></h2><div className="hero-art"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社白蓝斗笠侠客 IP"/><span className="ip-note">原子公社 · 原创 IP</span></div><p>八位 AI 侠客也在这个房间里生活：他们会走动、结伴闲聊、去展示馆看作品。邀请任何一位开始一对一私聊吧。</p><p className="source-note">名帖：{account?.name||'少侠'} · {rooms.find(r=>r.id===room)?.name||'当前房间'}（{rooms.find(r=>r.id===room)?.online??'—'}/{rooms.find(r=>r.id===room)?.capacity??'—'} 在线） · 断线 60 秒内可原身份重连</p><button className="secondary-button tour-entry" onClick={startTour}><Compass size={16}/>小镇导览</button></section>
    {rooms.length>1&&<section className="rail-section rooms"><header><h3><span className="green-dot"/>江湖客栈</h3><span>房间分流</span></header><div className="room-list">{rooms.map(r=><button key={r.id} className={r.id===room?'active':''} onClick={()=>setRoom(r.id)} disabled={r.id===room}><span className="room-name">{r.name}{r.id===room&&<i>当前</i>}</span><small>{r.online}/{r.capacity} 在线{r.waiting?` · ${r.waiting} 排队`:''}</small></button>)}</div><p><i/>每个房间是独立的世界，切换后看到新房间的侠客。</p></section>}
    <section className="rail-section happenings"><header><h3><span className="green-dot"/>江湖此刻</h3><span>联机动态</span></header><div className="event-list">{onlineActivity.slice(0,3).map((e,i)=><div className="event" key={e.id||i}><span className={`event-icon ${e.kind}`}>{e.kind==='chat'?<MessageCircle size={13}/>:e.kind==='rest'?<Coffee size={13}/>:e.kind==='welcome'?<Leaf size={13}/>:e.kind==='view'?<BookOpen size={13}/>:e.kind==='phase'?<Clock size={13}/>:<Footprints size={13}/>}</span><div><p>{e.text}</p><small>{i===0?'刚刚':'片刻前'}</small></div></div>)}{onlineActivity.length===0&&<div className="event"><span className="event-icon walk"><Footprints size={13}/></span><div><p>侠客们正在赶来…</p><small>片刻前</small></div></div>}</div></section>
    <section className="rail-section nearby"><header><h3><span className={`green-dot ${onlineState==='online'?'':'offline'}`}/>联机侠客</h3><span>{onlineState==='online'?'已连接':onlineState==='connecting'?'连接中…':onlineState==='taken-over'?'其他标签页已接管':onlineState==='full'?'房间已满':'重连中…'}</span></header><div className="nearby-avatars">{onlinePlayers.map(p=><button key={p.id} title={`${p.name}${p.ai?' · AI 侠客':''}${p.chat?' · 交谈中':''}`} onClick={()=>setActorCard(p)}><Avatar agent={{color:p.color}} size={38}/><small>{p.name}{p.ai&&<i className="ai-tag">AI</i>}{p.chat&&<i className="chat-tag">交谈中</i>}</small></button>)}</div><p><i/>{onlinePlayers.length?`${onlinePlayers.length} 位侠客在线 · 点击打招呼`:'侠客们正在赶来…'}</p></section>
   </>:<>
    <section className="welcome-card"><span className="eyebrow">初入江湖 · 幸会少侠</span><h2>相逢即是<br/>江湖同路人<span>。</span></h2><div className="hero-art"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社白蓝斗笠侠客 IP"/><span className="ip-note">原子公社 · 原创 IP</span><img className="hero-sticker" src={assetUrl('/brand/sticker-cheer.png')} alt=""/></div><p>我是阿原，你的点灯人。<br/>一盏茶的工夫，认识这片新江湖。</p><button className="primary-button" onClick={()=>startChat('ayuan')}><MessageCircle size={17}/>和阿原聊聊<ArrowUpRight size={17}/></button><button className="text-button" onClick={()=>openPanel('about')}>先了解原子公社<ArrowRight size={15}/></button><button className="secondary-button tour-entry" onClick={startTour}><Compass size={16}/>小镇导览</button></section>
    <section className="rail-section happenings"><header><h3><span className="green-dot"/>江湖此刻</h3><span>模拟动态</span></header><div className="event-list">{events.slice(0,3).map((e,i)=><div className="event" key={e.id}><span className={`event-icon ${e.kind}`}>{e.kind==='chat'?<MessageCircle size={13}/>:e.kind==='rest'?<Coffee size={13}/>:e.kind==='welcome'?<Leaf size={13}/>:e.kind==='view'?<BookOpen size={13}/>:e.kind==='phase'?<Clock size={13}/>:<Footprints size={13}/>}</span><div><p>{e.text}</p><small>{i===0?'刚刚':'片刻前'}</small></div></div>)}</div></section>
    <section className="rail-section nearby"><header><h3>遇见同行侠客</h3><button onClick={()=>openPanel('people')} aria-label="查看所有侠客">全部 <ArrowRight size={13}/></button></header><div className="nearby-avatars">{AGENTS.slice(0,5).map(a=><button key={a.id} title={`${a.name} · ${agents.find(x=>x.id===a.id)?.state}`} onClick={()=>startChat(a.id)}><Avatar agent={a} size={38}/><small>{a.name}</small></button>)}</div><p><i/>8 位 AI 伙伴 · 随时可以打个招呼</p></section>
   </>}
    <button className="exhibition-promo" onClick={enterHall}><span className="promo-icon"><BookOpen size={22}/></span><span><small>灵感在这里相遇</small><strong>去武林大会逛逛</strong></span><ArrowUpRight size={20}/></button>
    <footer className="rail-footer">每个人都是一颗原子，聚在一起便是江湖。<small className="version-line">内容快照 {catalogState.catalog?.snapshotId||'—'} · 地图 {MAP_VERSION} · 展陈 v{exhibition.layoutVersion} · {staticDemo?'静态演示':world==='online'?'联机世界':catalogState.source==='api'?'内容接口':'本地快照降级'}</small><button onClick={()=>openPanel('about')}>关于这个世界 ↗</button></footer>
  </aside>}
  </main>
  {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  {panel==='gallery'&&<Dialog title="武林大会展示馆" subtitle="EXHIBITIONS · 真实作品，长久相逢" onClose={closePanel} className="gallery-dialog" hidden={!!work}><div className="edition-tabs">{editions.map(e=><button key={e.id} className={e.id===editionId?'active':''} onClick={()=>{setEditionId(e.id);setTrack('全部');setSearch('');}}>{e.title}<span>{e.works.length?`${e.works.length} 份作品`:'介绍整理中'}</span></button>)}</div><div className="edition-intro"><span className="eyebrow">{currentEdition.subtitle}</span><p>{currentEdition.description}</p>{currentEdition.organizers&&<dl className="edition-facts">{Object.entries(currentEdition.organizers).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{Array.isArray(v)?v.join(' · '):v}</dd></div>)}</dl>}{currentEdition.schedule&&<div className="edition-schedule"><h4>赛程</h4>{currentEdition.schedule.map(ph=><div key={ph.阶段} className="schedule-row"><strong>{ph.阶段}<small>{ph.时间}</small></strong><p>{ph.内容}</p></div>)}</div>}{currentEdition.awards&&<div className="edition-awards"><h4>奖项设置 · {currentEdition.awards.总奖金}</h4><table className="awards-table"><tbody>{currentEdition.awards.明细.map(a=><tr key={a.奖项}><td>{a.奖项}</td><td className="award-amount">{a.奖金}</td><td>{a.数量}</td><td className="award-note">{a.说明}</td></tr>)}</tbody></table><small>{currentEdition.awards.备注}</small></div>}{currentEdition.benefits&&<div className="edition-benefits"><h4>参赛权益</h4><ul>{currentEdition.benefits.map(b=><li key={b}>{b}</li>)}</ul></div>}</div><div className="gallery-tools"><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索作品、作者或灵感…" aria-label="搜索作品"/>{search&&<button onClick={()=>setSearch('')} aria-label="清空搜索"><X size={15}/></button>}</div><select value={track} onChange={e=>setTrack(e.target.value)} aria-label="筛选赛道"><option>全部</option>{currentEdition.tracks.map(t=><option key={t}>{t}</option>)}</select></div><div className="result-line"><span>{currentEdition.works.length?`${filtered.length} 份作品`:'本届作品整理中'}</span><span>公共展陈 展区 1/{zoneCount} · 全房间一致，筛选只影响本面板</span></div><div className="work-grid">{filtered.map(workCard)}{filtered.length===0&&<div className="empty-state"><Search/><h3>{currentEdition.works.length?'暂未找到相关作品':'本届作品整理中'}</h3><p>{currentEdition.works.length?'试试其他关键词或切换赛道。':'赛事介绍已经发布；参赛作品与结果资料核对后上线。'}</p>{currentEdition.works.length>0&&<button className="secondary-button" onClick={()=>{setSearch('');setTrack('全部');}}>清除筛选</button>}</div>}</div><p className="source-note">{currentEdition.note}</p><button className="secondary-button gallery-walk" onClick={closePanel}><Footprints size={16}/>收起目录，看看 3D 展厅</button></Dialog>}
  {work&&<Dialog title={work.title} subtitle={`${editions.find(e=>e.id===work.editionId).title} / ${work.track}`} onClose={closeWork} className="work-dialog"><div className="work-detail"><a href={work.poster} target="_blank" rel="noreferrer" className="poster-link"><img src={work.poster} alt={`${work.title}原始作品海报`}/><span><ExternalLink size={14}/>打开原图</span></a><div className="work-description"><div className="author-line"><Avatar size={32}/><div><small>作品作者</small><p>{work.author}</p></div></div><blockquote>{work.tagline}</blockquote>{work.highlight&&<p className="work-highlight">{work.highlight}</p>}<h3>关于这个作品</h3><p>{work.description}</p><div className="tag-list">{work.tags.map(t=><span key={t}>{t}</span>)}</div><div className="detail-actions"><button className="primary-button" onClick={()=>toggleBookmark(work.id)}><Bookmark size={17} fill={bookmarks.includes(work.id)?'currentColor':'none'}/>{bookmarks.includes(work.id)?'已收入手札':'收藏到手札'}</button><button className="secondary-button" onClick={share}><ArrowUpRight size={17}/>分享作品</button></div><p className="source-note">来源：原赛事展示资料。作品效果与成果为作者资料陈述。收藏保存在此浏览器。</p></div></div></Dialog>}
  {panel==='place'&&place&&<Dialog title={place.name} subtitle="江湖地图 · 一处相逢" onClose={closePanel} className="small-dialog"><div className="place-detail"><div className={`place-illustration ${place.id}`}><span>{place.id==='hall'?'展':place.id==='tea'?'茶':place.id==='library'?'书':place.id==='workshop'?'创':place.id==='future-lodge'?'待':'星'}</span></div>{place.status==='placeholder'&&<span className="placeholder-badge">占位建筑 · 等待功能定义</span>}<h3>{place.subtitle}</h3><p>{place.description}</p><div className="detail-actions">{world==='online'&&!staticDemo&&place.id==='tea'&&<div className="seat-picker"><h4>茶桌共坐{mySeat?' · 已入座':''}</h4><div className="seat-grid">{SEATS.map(st=>{const taken=seats.find(x=>x.seat===st.id);return <button key={st.id} className={`seat-chip ${taken?'taken':''} ${mySeat===st.id?'mine':''}`} disabled={!!taken||!!mySeat} onClick={()=>{clientRef.current?.sit(st.id);}}>{taken?taken.name:'空位'}<small>{st.label}</small></button>;})}</div>{mySeat&&<button className="secondary-button" onClick={()=>clientRef.current?.stand()}><LogOut size={15}/>起身</button>}{mySeat&&<div className="seat-table"><h5>同桌 · {mySeatDef?.label.split(' · ')[0]}</h5>{tableMates.length?tableMates.map(m=><div className="table-mate" key={m.userId}><span className="table-mate-name">{m.name}{m.chat?' · 交谈中':''}{m.ai?' · AI':''}</span><button className="secondary-button" disabled={!!m.chat} onClick={()=>clientRef.current?.invite(m.userId)}><MessageCircle size={13}/>{m.ai?'请他闲聊':'邀请私聊'}</button></div>):<p className="setting-description">这一桌暂时只有你。同桌的人会出现在这里，一键就能请他闲聊。</p>}</div>}<p className="setting-description">入座后位置由服务端锁定，附近的侠客会看到你坐在桌旁；坐着也能私聊。</p></div>}{place.status==='placeholder'?<button className="secondary-button" onClick={()=>{setPanel(null);apiRef.current?.focus(place.id);notice('正在前往这座待定建筑');}}><Footprints size={16}/>去看看占位空间</button>:<button className="primary-button" onClick={()=>{if(place.id==='hall')enterHall();else if(place.id==='tea')startChat('qinghe');else if(place.id==='workshop')startChat('xingzhou');else openPanel('about');}}>{place.id==='hall'?'进入展示馆':place.id==='tea'||place.id==='workshop'?'与伙伴交流':'了解更多'}<ArrowUpRight size={17}/></button>}<button className="secondary-button" onClick={()=>{setPanel(null);apiRef.current?.focus(place.id);notice(`正在前往${place.short}`);}}><Footprints size={16}/>走过去</button></div></div></Dialog>}
  {panel==='chat'&&chatAgent&&<Dialog title={`与${chatAgent.name}聊聊`} subtitle={`${chatAgent.role} · AI 角色`} onClose={closeChat} className="chat-dialog" hidden={!!work}><div className="chat-mode"><span className="green-dot"/>{mode==='model'?'模型对话已连接':'本地资料演示 · 尚未连接语言模型'}</div><details className="public-memories"><summary>江湖见闻 · 公开活动记录</summary>{(agents.find(a=>a.id===chatId)?.memory||[]).length?(agents.find(a=>a.id===chatId)?.memory||[]).slice(-3).map((m,i)=><p key={i}>{m}</p>):<p>还没有与其他侠客交流的公开记录。</p>}</details><div className="chat-messages" ref={chatScroll} aria-live="polite">{(messages[chatId]||[]).map((m,i)=><div key={i} className={`message ${m.role} ${m.error?'error':''}`}>{m.role==='assistant'&&<Avatar agent={chatAgent} size={30}/>}<div className="message-body"><p>{m.content}</p>{m.workIds?.map(id=>{const w=allWorks.find(w=>w.id===id);return w?<button key={id} className="chat-work" onClick={()=>openWork(id)}><img src={w.thumb} alt=""/><span>{w.title}<small>{w.track}</small></span><ArrowUpRight size={15}/></button>:null;})}</div></div>)}{sending&&<div className="typing">{chatAgent.name}正在整理思绪<span>···</span></div>}</div><div className="quick-questions">{['推荐效率工具作品','介绍原子公社','你还记得我吗？','你今天在馆里看了什么？'].map(q=><button key={q} disabled={sending} onClick={()=>sendMessage(q)}>{q}</button>)}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();sendMessage();}}><input aria-label="聊天消息" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="聊聊你的想法…" maxLength={1000}/><button aria-label="发送消息" disabled={sending||!draft.trim()}><Send size={19}/></button></form><label className="memory-consent"><input type="checkbox" checked={remember} onChange={e=>changeRemember(e.target.checked)}/>记住我主动表达的兴趣，仅本人账号可见，可随时删除</label></Dialog>}
  {panel==='people'&&<Dialog title="同行侠客" subtitle="每个相逢，都可能是共创的开始" onClose={closePanel} className="people-dialog"><div className="people-list">{AGENTS.map(a=><div key={a.id} className="people-row"><button onClick={()=>startChat(a.id)}><Avatar agent={a} size={52}/><span><strong>{a.name}<i>AI</i></strong><p>{a.role}</p><small>{agents.find(x=>x.id===a.id)?.state}</small></span><MessageCircle size={20}/></button><button className={`follow-button ${isFollowing('ai',a.id)?'on':''}`} onClick={()=>toggleFollow('ai',a.id)} aria-label={`${isFollowing('ai',a.id)?'取消关注':'关注'}${a.name}`}>{isFollowing('ai',a.id)?'已关注':'+ 关注'}</button></div>)}</div><p className="source-note">角色为虚构 AI 伙伴，不代表真实主理人或作者。当前世界运行在本地浏览器。</p></Dialog>}
  {panel==='journal'&&<Dialog title="游历手札" subtitle="你的相逢与发现，留在这里" onClose={closePanel} className="journal-dialog" hidden={!!work}><div className="journal-tabs">{['收藏作品','最近看过','私人记忆','我的关注'].map(t=><button className={journalTab===t?'active':''} key={t} onClick={()=>setJournalTab(t)}>{t}</button>)}</div>{journalTab==='我的关注'?<FollowsTab account={account} follows={follows} onlinePlayers={onlinePlayers} aiPresence={aiPresence} onToggle={toggleFollow} onLogin={()=>{setAuthMode('login');setAuthError('');setAuthOpen(true);}}/>:journalTab==='私人记忆'?<div className="memory-list">{!account?<div className="empty-state"><Sparkles/><h3>登录后查看私人记忆</h3><p>记忆按账号与角色隔离保存，只有本人可见。</p><button className="primary-button" onClick={()=>{setAuthMode('login');setAuthError('');setAuthOpen(true);}}>登录名帖</button></div>:<><p>只有对应侠客会在你开启记忆时使用这些记录；删除后立即不再被引用，并同步清除当前对话上下文。</p>{memories.length===0?<div className="empty-state"><Sparkles/><h3>还没有保存的记忆</h3><p>与侠客聊天时，你可以主动开启兴趣记忆。</p></div>:<>{memories.map(m=><article key={m.id}><Avatar agent={AGENTS.find(a=>a.id===m.agentId)}/><div><small>{AGENTS.find(a=>a.id===m.agentId)?.name} · {m.source}</small><p>{m.text}</p></div><button aria-label="删除这条记忆" className="icon-button" onClick={()=>deleteMemory(m.id)}><Trash2 size={16}/></button></article>)}<button className="danger-button" onClick={()=>deleteMemory()}>删除全部私人记忆</button></>}</>}</div>:<div className="work-grid">{(journalTab==='收藏作品'?bookmarks:visits.map(v=>v.id)).map(id=>allWorks.find(w=>w.id===id)).filter(Boolean).map(workCard)}{(journalTab==='收藏作品'?bookmarks:visits).length===0&&<div className="empty-state"><BookOpen/><h3>手札的第一页，等你来写</h3><p>去展馆发现一个喜欢的作品吧。</p><button className="primary-button" onClick={enterHall}>去看看作品<ArrowRight size={16}/></button></div>}</div>}<p className="source-note">收藏与浏览记录保存在此浏览器；私人记忆保存在你的账号里（仅本人可见）。</p></Dialog>}
  {panel==='settings'&&<Dialog title="定制这片江湖" subtitle="你的侠客，你的小世界" onClose={closePanel} className="settings-dialog"><div className="settings-content"><h3>{account?'侠客名帖 · 账号':'本地形象'}</h3>{account&&<p className="setting-description">名帖保存在账号里：联机世界中的名字与衣带色以此为准，修改后房间内立即生效。</p>}<div className="profile-editor"><Avatar size={64} agent={{color:profileDraft.color}}/><label>我的昵称<input value={profileDraft.name} onChange={e=>setProfileDraft(d=>({...d,name:e.target.value.slice(0,20)}))} maxLength={20} aria-label="我的昵称"/></label></div><label>衣带颜色</label><div className="color-options">{['#427ab5','#719783','#a17b9e','#b68b54','#be7770'].map(c=><button key={c} aria-label={`衣带颜色 ${c}`} className={c===profileDraft.color?'active':''} style={{background:c}} onClick={()=>setProfileDraft(d=>({...d,color:c}))}>{c===profileDraft.color&&<Check size={18}/>}</button>)}</div><button className="primary-button" onClick={saveProfile}>{account?'保存名帖':'保存本地形象'}</button><h3>世界主题</h3><p className="setting-description">切换建筑与环境配色，保留原子公社的场景布局和真实作品。</p><div className="theme-options">{Object.entries(THEMES).map(([id,t])=><button key={id} className={id===theme?'active':''} onClick={()=>setTheme(id)}><span style={{background:t.roof}}/>{t.name}{theme===id&&<Check size={15}/>}</button>)}</div><label className="setting-toggle"><span>地图建筑标签</span><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/></label><label className="setting-toggle"><span>灯火夜景</span><input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/></label><button className="secondary-button" onClick={()=>{setTheme('jianghu');setPlayerColor('#427ab5');setNight(false);setShowLabels(true);setProfileDraft(d=>({...d,color:'#427ab5'}));apiRef.current?.reset();}}>恢复默认场景</button>{account&&<button className="danger-button" onClick={logout}>退出登录</button>}</div></Dialog>}
  {memoryOffer&&account&&<Dialog title="发现本机旧记忆" subtitle="是否迁移到当前账号" onClose={()=>setMemoryOffer(null)} className="small-dialog"><div className="place-detail"><p>此浏览器里保存着 {memoryOffer.length} 条旧版私人记忆（按角色隔离）。你可以把它们迁入当前账号，之后任何设备登录都能使用；也可以保留在本机。</p><p className="source-note">不会自动归入账号——需要你明确选择。</p><div className="detail-actions"><button className="primary-button" onClick={async()=>{const items=memoryOffer.map(m=>({agentId:m.agentId,text:m.text,source:m.source||'从本机迁移'}));try{const r=await fetch(apiUrl('/api/memories/import'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account.token,items})});const d=await r.json();if(r.ok){writeStore('memories',[]);notice(`已迁移 ${d.imported} 条记忆到账号`);const again=await fetch(apiUrl(`/api/memories?token=${encodeURIComponent(account.token)}&agentId=`));const list=await again.json();setMemories(list.items||[]);}else notice(d.error||'迁移失败');}catch{notice('迁移失败，请稍后再试');}setMemoryOffer(null);}}><Sparkles size={16}/>迁移到账号</button><button className="secondary-button" onClick={()=>{setMemoryOffer(null);notice('已保留在本机，可稍后在设置中迁移');}}>保留在本机</button></div></div></Dialog>}
  {authOpen&&authProvider==='external'&&<Dialog title="使用社区账号登录" subtitle="原子公社账号体系" onClose={()=>setAuthOpen(false)} className="auth-dialog"><div className="auth-content"><p className="setting-description">联机世界已接入社区账号体系：粘贴你的访问令牌即可进入（令牌由社区账号系统签发，服务端验证后建立本地会话）。</p><label>访问令牌<textarea value={externalToken} onChange={e=>setExternalToken(e.target.value)} placeholder="粘贴社区账号访问令牌" rows={4} aria-label="访问令牌"/></label>{authError&&<p className="auth-error">{authError}</p>}<button className="primary-button" disabled={authBusy||!externalToken.trim()} onClick={submitExternal}>{authBusy?'验证中…':'进入联机世界'}</button></div></Dialog>}
  {authOpen&&authProvider!=='external'&&<Dialog title={authMode==='register'?'创建侠客名帖':'登录联机江湖'} subtitle="账号信息只保存在此本地服务" onClose={()=>setAuthOpen(false)} className="auth-dialog"><div className="auth-content"><div className="auth-tabs"><button className={authMode==='register'?'active':''} onClick={()=>{setAuthMode('register');setAuthError('');}}>注册名帖</button><button className={authMode==='login'?'active':''} onClick={()=>{setAuthMode('login');setAuthError('');}}>登录</button></div><p className="setting-description">联机世界需要账号：位置与私聊由服务端按会话身份校验。这是本地演示账号体系，不是生产鉴权。</p><label>名帖昵称<input value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value.slice(0,20)}))} maxLength={20} placeholder="少侠" aria-label="名帖昵称"/></label><label>密码<input type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value.slice(0,64)}))} placeholder={authMode==='register'?'至少 6 位':'请输入密码'} aria-label="密码"/></label><label>衣带颜色</label><div className="color-options">{['#427ab5','#719783','#a17b9e','#b68b54','#be7770'].map(c=><button key={c} aria-label={`衣带颜色 ${c}`} className={c===authForm.color?'active':''} style={{background:c}} onClick={()=>setAuthForm(f=>({...f,color:c}))}>{c===authForm.color&&<Check size={18}/>}</button>)}</div>{authError&&<p className="auth-error">{authError}</p>}<button className="primary-button" disabled={authBusy} onClick={submitAuth}>{authBusy?'处理中…':authMode==='register'?'创建并进入联机世界':'登录并进入'}</button></div></Dialog>}
  {panel==='about'&&<Dialog title="聚是一团火，散作满天星" subtitle="原子公社 ATOMHUB · 品牌与共建" onClose={closePanel} className="about-dialog"><div className="about-content"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社侠客 IP"/><div><span className="eyebrow">人与 AGENT 共建的开源学习社区</span><img className="brand-lockup" src={assetUrl(night?'/brand/atomhub-lockup-white.png':'/brand/atomhub-lockup-black.png')} alt="原子公社 AtomHub 官方 Logo"/><img className="brand-lockup atomesh" src={assetUrl(night?'/brand/atomesh-lockup-white.png':'/brand/atomesh-lockup-black.png')} alt="原子之心 Atomesh 旗下社区品牌"/><h3>每个人都是一颗原子。</h3><p>人在这里提供经验与认知，Agent 带来效率与协助。一起分享真实案例、探索 AI 工具，把新的想法做成能解决问题的作品。</p><div className="values">{['个体至上','开放共享','务实求真','互助共赢','持续进化'].map((v,i)=><span key={v}><small>0{i+1}</small>{v}</span>)}</div><p>主理人是社区的“点灯人”。小镇将这份迎新与连接的职责交给阿原，将开放学习、共创实践和成果展示分别放进书院、工坊与比赛展示馆。</p><div className="sticker-wall-wrap"><img src={assetUrl('/brand/sticker-wall.webp')} alt="原子公社侠客表情包"/><small>社区表情包 · 原子公社原创 IP</small></div><p className="source-note">品牌依据：《原子公社对外介绍 v2.2》 第 1、5—10、21 页。IP 与表情包来自你提供的素材。此版本为本地 3D 原型；真人联机、云端记忆及运营发布后台尚未接入。</p><a href="https://github.com/a16z-infra/ai-town" target="_blank" rel="noreferrer" className="text-button">技术参考 · AI Town<ExternalLink size={14}/></a></div></div></Dialog>}
  {invite&&<Dialog title="聊天邀请" subtitle={`${invite.name} 想和你聊聊`} onClose={()=>{clientRef.current?.reject(invite.from,invite.id);setInvite(null);}} className="small-dialog"><div className="place-detail"><div className="author-line"><Avatar size={44} agent={{color:'#427ab5'}}/><div><small>来自联机侠客</small><p>{invite.name}</p></div></div><p>对方邀请你进行一对一私聊。私聊内容只有你们两人可见，不会进入世界快照。</p><div className="detail-actions"><button className="primary-button" onClick={()=>clientRef.current?.accept(invite.from,invite.id)}><MessageCircle size={16}/>接受邀请</button><button className="secondary-button" onClick={()=>{clientRef.current?.reject(invite.from,invite.id);setInvite(null);}}>拒绝</button></div></div></Dialog>}
  {conversation&&<Dialog title={`与${conversation.name}私聊`} subtitle="一对一 · 仅两人可见" onClose={()=>{clientRef.current?.leave();setConversation(null);}} className="chat-dialog"><div className="chat-mode"><span className="green-dot"/>{conversation.ai?(aiMode==='model'?'AI 侠客 · 模型对话':'AI 侠客 · 本地资料演示'):'联机私聊 · 服务端转发'}</div>{conversation.ai&&<details className="public-memories"><summary>江湖见闻 · 公开活动记录</summary>{(aiPresence[conversation.id]?.recent||[]).length?(aiPresence[conversation.id]?.recent||[]).map((m,i)=><p key={i}>{m}</p>):<p>还没有与其他侠客交流的公开记录。</p>}{(aiPresence[conversation.id]?.views||[]).map((v,i)=><p key={'v'+i}>在展示馆看了《{v.title}》：{v.impression}</p>)}</details>}<div className="chat-messages" aria-live="polite">{onlineMessages.map((m,i)=><div key={i} className={`message ${m.role==='them'?'assistant':'user'}`}><div className="message-body"><p>{m.text}</p>{m.role==='me'&&!m.sent&&<small>发送中…</small>}{m.workIds?.map(id=>{const w=allWorks.find(w=>w.id===id);return w?<button key={id} className="chat-work" onClick={()=>openWork(id)}><img src={w.thumb} alt=""/><span>{w.title}<small>{w.track}</small></span><ArrowUpRight size={15}/></button>:null;})}</div></div>)}</div><div className="quick-questions">{[...['推荐效率工具作品','介绍原子公社','你还记得我吗？','你今天在馆里看了什么？'],...(aiPresence[conversation.id]?.views?.[0]?.title?[`你最近看了《${aiPresence[conversation.id].views[0].title}》？`]:[])].map(q=><button key={q} onClick={()=>{if(!conversation)return;const id=clientRef.current?.sendMsg(conversation.id,q);if(id)setOnlineMessages(m=>[...m,{role:'me',text:q,id}]);}}>{q}</button>)}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();const text=onlineDraft.trim();if(!text||!conversation)return;const id=clientRef.current?.sendMsg(conversation.id,text);if(id){setOnlineMessages(m=>[...m,{role:'me',text,id}]);setOnlineDraft('');}}}><input aria-label="私聊消息" value={onlineDraft} onChange={e=>setOnlineDraft(e.target.value.slice(0,500))} placeholder="只有对方能看到…" maxLength={500}/><button aria-label="发送私聊" disabled={!onlineDraft.trim()}><Send size={19}/></button></form><div className="detail-actions"><button className="secondary-button" onClick={()=>{clientRef.current?.leave();setConversation(null);}}><LogOut size={15}/>离开会话</button><button className="danger-button" onClick={()=>{if(conversation){clientRef.current?.block(conversation.id);setBlocked(b=>[...new Set([...b,conversation.id])]);}clientRef.current?.leave();setConversation(null);notice('已屏蔽并离开会话');}}><ShieldOff size={15}/>屏蔽并离开</button></div></Dialog>}
  {actorCard&&<Dialog title={actorCard.name} subtitle={actorCard.ai?'AI 侠客 · 名帖':'联机侠客 · 名帖'} onClose={()=>setActorCard(null)} className="small-dialog"><div className="place-detail"><div className="author-line"><Avatar size={44} agent={{color:actorCard.color}}/><div><small>{actorCard.ai?'AI 角色':'联机身份'}</small><p>{actorCard.name}{actorCard.chat?' · 交谈中':''}</p></div></div><p>{actorCard.ai?`${actorCard.name}是服务端运行的 AI 侠客，代表设定与已发布资料。邀请后即可一对一私聊；观感只来自它真正在馆里看过的作品。`:'同一房间里的另一位成员。邀请一对一私聊，内容只有你们两人可见；屏蔽后不再收到对方的邀请。'}</p>{actorCard.ai&&aiPresence[actorCard.id]&&((aiPresence[actorCard.id].recent||[]).length>0||(aiPresence[actorCard.id].views||[]).length>0)&&<div className="presence-card">{((aiPresence[actorCard.id].recent||[]).length>0)&&<><h4>最近动态</h4><ul>{(aiPresence[actorCard.id].recent||[]).map((m,i)=><li key={i}>{m}</li>)}</ul></>}{((aiPresence[actorCard.id].views||[]).length>0)&&<><h4>最近在看</h4><ul>{(aiPresence[actorCard.id].views||[]).map((v,i)=><li key={'v'+i}>《{v.title}》{v.impression}</li>)}</ul></>}</div>}<div className="detail-actions"><button className="primary-button" disabled={!!actorCard.chat} onClick={()=>{clientRef.current?.invite(actorCard.id);setActorCard(null);notice(actorCard.ai?`已开始与${actorCard.name}私聊`:'邀请已发出，等待对方回应');}}><UserPlus size={16}/>发起私聊</button><button className="secondary-button" onClick={()=>toggleFollow(actorCard.ai?'ai':'player',actorCard.id)}>{isFollowing(actorCard.ai?'ai':'player',actorCard.id)?'取消关注':'关注'}</button><button className="secondary-button" onClick={()=>{setBlocked(b=>[...new Set([...b,actorCard.id])]);clientRef.current?.block(actorCard.id);setActorCard(null);notice('已屏蔽该侠客');}}><ShieldOff size={15}/>屏蔽</button></div></div></Dialog>}
 </div>;
}
