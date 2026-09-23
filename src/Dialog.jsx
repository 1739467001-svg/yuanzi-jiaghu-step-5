import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export default function Dialog({title,subtitle,onClose,children,className='',hidden=false}){
 const ref=useRef(),closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const before=document.activeElement;ref.current?.querySelector('button')?.focus();return()=>{if(before?.isConnected)before.focus();};},[]);
 function key(e){if(e.key==='Escape'){e.stopPropagation();closeRef.current();}if(e.key==='Tab'){const els=[...ref.current.querySelectorAll('button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]')].filter(x=>x.offsetParent!==null);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}}}
 return <div className={`dialog-shade ${className}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} inert={hidden?true:undefined}><section ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={key}><header className="dialog-header"><div><span className="eyebrow">{subtitle||'ATOMHUB · 原子江湖'}</span><h2>{title}</h2></div><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
