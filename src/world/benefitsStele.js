// 门派内景里的「权益碑」：石碑 + 展开的竹简，列出门派权益。
// 权益来自服务端（掌门/长老维护；官网权益系统接口就绪后改为只读同步）。
import * as T from 'three';
import {box,cylinder,dmesh,textSign} from './models.js';

export function benefitsStele(parent,x,z,benefits=[],theme){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 const list=(benefits||[]).slice(0,6);
 dmesh(new T.BoxGeometry(3.4,.5,1.8),'#b9b8a7','stone',g,0,.25,0,2,.9);
 dmesh(new T.BoxGeometry(1.6,2.6,.5),'#c9c8b7','stone',g,0,1.65,0,1,.92);
 dmesh(new T.BoxGeometry(2,.45,.7),'#a9a693','stone',g,0,3.15,0,2,.85);
 textSign(g,'权益碑',0,2.3,.28,2.2,.6,'#e8dcc0','#7a3a2a');
 // 竹简架：每条权利一简
 list.forEach((b,i)=>{
  const sx=(i%3-1)*1.15,row=Math.floor(i/3);
  cylinder(g,sx,.72+row*.75,-.75+row*.9,.055,.055,1.15,'#c9a86a',6);
  box(g,sx,.72+row*.75,-.7+row*.9,.16,1.05,.09,i%2?'#e6d3a3':'#dcc794');
  box(g,sx,.98+row*.75,-.64+row*.9,.11,.16,.05,'#8a6b45');
  textSign(g,b.title.slice(0,8),sx,.72+row*.75,-.62+row*.9,1.1,.3,'#f2e8c8','#5a4a2a');
 });
 if(!list.length)textSign(g,'权益待接入',0,1.6,.3,2.4,.5,'#efe8d4','#9a8a62');
 return g;
}
