// World.jsx：新增 'sects'（门派大殿）与 'sect'（内景）场景分支。
import fs from 'node:fs';
const p='src/world/World.jsx';
let s=fs.readFileSync(p,'utf8');
const edits=[
 ["  if(location==='town'){",
  "  let sectScene=null;\n  if(location==='sects'&&sectPage){\n   sectScene=buildSectsHall(base,{sects:sectPage.sects,page:sectPage.page,pages:sectPage.pages,palette,night});\n  }else if(location==='sect'&&sectDetail){\n   sectScene=buildSectInterior(base,{sect:sectDetail,palette,night});\n  }else if(location==='town'){"],
 ["     if(kind==='place')callbacks.current.onPlace(id);else if(kind==='agent')callbacks.current.onAgent(id);else if(kind==='work')callbacks.current.onWork(id);",
  "     if(kind==='place')callbacks.current.onPlace(id);else if(kind==='agent')callbacks.current.onAgent(id);else if(kind==='work')callbacks.current.onWork(id);\n     else if(kind==='sect')callbacks.current.onSectEnter?.(id);\n     else if(kind==='sect-page'){const p=o.userData;callbacks.current.onSectPage?.(p.dir);}"],
];
for(const [from,to] of edits){
 if(!s.includes(from))throw new Error('anchor not found: '+from.slice(0,50));
 s=s.replace(from,to);
}
fs.writeFileSync(p,s);
console.log('World.jsx sect scenes wired');
