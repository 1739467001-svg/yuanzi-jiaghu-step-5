// 门派 3D 场景构建器（本地演示与联机世界共用）：
// 1) buildSectsHall：门派大殿——每页 4 座门派牌坊，按 style 着色，匾额写门派名，
//    左右翻页台（userData.kind='sect-page'，dir=-1/+1）。
// 2) buildSectInterior：门派内景——聚义阁式层级：
//    创始人主位居中抬高 → 长老阁两侧 → 弟子按称号分层列席（大师兄/二师兄在前）。
// 所有可点击对象挂 userData：{kind:'sect',id} / {kind:'sect-page',dir} / {kind:'sect-back'}。
import * as T from 'three';
import {THEMES} from './config.js';
import {box,ball,cylinder,dmesh,material,textSign,roof} from './models.js';

const ROLE_ORDER=['大师兄','二师兄','大师姐','二师姐','师弟','师妹','弟子'];
function discipleRank(m){
 const i=ROLE_ORDER.indexOf(m.title);
 return i<0?ROLE_ORDER.length:i;
}
// 大殿地面/台基
function hallFloor(parent,palette,night){
 const g=new T.Group();parent.add(g);
 dmesh(new T.BoxGeometry(46,.5,34),night?'#4a5a52':'#b9c8a3','grass',g,0,-.25,0,12,.98);
 dmesh(new T.BoxGeometry(46,.2,34),'#c3bfa7','stone',g,0,.05,0,12,.95);
 return g;
}
function sectBanner(parent,sect,x,z,palette,interactive){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 g.userData={kind:'sect',id:sect.id};if(interactive)interactive.push(g);
 const c=sect.style==='startup'?'#587c92':sect.style==='mystery'?'#625d79':sect.style==='campus'?'#ad7860':'#42746d';
 const w=6,d=4.2;
 // 台基 + 主体 + 屋顶（按门派样式着色）
 dmesh(new T.BoxGeometry(w+.6,.42,d+.6),'#b7b8a7','stone',g,0,.21,0,3,.95);
 dmesh(new T.BoxGeometry(w,2.5,d),'#eee2c5','plaster',g,0,1.65,0,2,.92);
 roof(g,w+1.1,d+1,3.15,c,1.15);
 // 门派旗幡（样式色）
 for(const sx of [-1,1]){cylinder(g,sx*(w/2+.5),1.9,d/2+.5,.045,.05,3.2,'#6d5943',8);box(g,sx*(w/2+.5),.18,d/2+.5,.32,.28,.32,'#a89a80');}
 box(g,-(w/2+1),2.35,d/2+.5,.7,1.35,.06,c);box(g,(w/2+1),2.35,d/2+.5,.7,1.35,.06,'#e8dcc0');
 // 名称匾额 + slogan
 textSign(g,sect.name,0,3.05,d/2+.26,Math.min(w*.7,3.4),.62);
 textSign(g,sect.slogan||'—',0,2.2,d/2+.32,Math.min(w*.62,3),.4,'#f2ecd8','#6b6152');
 // 灯笼
 lantern2(g,-(w/2-.4),2.6,d/2+.7);lantern2(g,(w/2-.4),2.6,d/2+.7);
 return g;
}
function lantern2(parent,x,y,z){cylinder(parent,x,y+.3,z,.035,.035,.35,'#6a5540',6);ball(parent,x,y,z,.2,'#dd9b56',[.8,1.3,.8]);}
function pagePillar(parent,x,z,dir,palette,interactive){
 const g=new T.Group();g.position.set(x,0,z);parent.add(g);
 g.userData={kind:'sect-page',dir};if(interactive)interactive.push(g);
 dmesh(new T.CylinderGeometry(1.1,1.3,.5,12),'#b7b8a7','stone',g,0,.25,0,2,.9);
 box(g,0,1.15,0,1.5,1.6,.5,'#8a6b45');
 box(g,dir*.5,1.15,.32,.9,.16,.06,'#e6b978');
 ball(g,dir*.72,1.15,.36,.12,'#d8b56a');
 return g;
}
// 门派大殿：返回 {dispose}
export function buildSectsHall(parent,{sects,page,pages,palette,night},interactive=[]){
 const g=new T.Group();parent.add(g);
 hallFloor(g,palette,night);
 const xs=[-14,-4.6,4.6,14];
 sects.forEach((s,i)=>{if(i<4)sectBanner(g,s,xs[i],-2,palette,interactive);});
 // 翻页台：左页在左侧、右页在右侧（pages>1 时才显示）
 if(pages>1){
  pagePillar(g,-19,8,-1,palette,interactive);
  pagePillar(g,19,8,1,palette,interactive);
 }
 // 返回小镇的门口
 const back=new T.Group();back.position.set(0,0,15);g.add(back);
 back.userData={kind:'sect-back'};if(interactive)interactive.push(back);
 dmesh(new T.BoxGeometry(5,.4,1.6),'#b7b8a7','stone',back,0,.2,0,2,.9);
 textSign(back,'返回小镇',0,1.4,.9,2.4,.5);
 // 牌坊位次：让调用方在大殿里给每座门派挂可点击的名牌（手机上比点小旗幡可靠）。
 return {dispose(){parent.remove(g);},banners:sects.slice(0,4).map((s,i)=>({id:s.id,name:s.name,x:xs[i],z:-2}))};
}
// 门派内景：创始人主位 → 长老阁 → 弟子列席
function seatFigure(parent,{name,title,color,x,z,y=0,elevated=false,bannerBg}){
 const g=new T.Group();g.position.set(x,y,z);parent.add(g);
 const h=elevated?1.05:.78;
 // 座席
 dmesh(new T.BoxGeometry(1.5,.28,1.2),'#8a6b45','wood',g,0,.14,0,1,.8);
 if(elevated){
  dmesh(new T.BoxGeometry(2.1,.5,1.6),'#a8884f','wood',g,0,.25,0,2,.75);
  box(g,0,.75,0,1.7,.9,.5,'#7c5f3a');
 }
 // 人物（程序化小人，按身份着色）
 const body=new T.Group();body.position.y=h;g.add(body);
 cylinder(body,0,.47,0,.28,.39,.57,'#f5eee0');cylinder(body,0,.39,0,.36,.37,.1,color);
 ball(body,0,.96,.025,.43,'#fff9ed',[1.1,.96,.91]);
 ball(body,0,1.06,-.15,.42,'#393b3a',[1,1,.6]);
 cylinder(body,0,1.37,0,.11,.72,.28,'#363e3d',24);cylinder(body,0,1.23,0,.73,.73,.035,'#303938',24);
 ball(body,0,1.58,-.12,.16,'#363b3a');cylinder(body,0,1.51,-.12,.12,.13,.07,color);
 // 称号牌（聚义阁位次的名牌）
 textSign(g,`${title} · ${name}`,0,h+1.95,.7,elevated?2.6:2.1,.42,bannerBg||'#eadfc2',elevated?'#8a5a2a':'#324e46');
 return g;
}
export function buildSectInterior(parent,{sect,palette,night},interactive=[]){
 const g=new T.Group();parent.add(g);
 hallFloor(g,palette,night);
 // 聚义阁主厅
 dmesh(new T.BoxGeometry(30,.6,4),'#eee2c5','plaster',g,0,.3,-13,4,.92);
 roof(g,31,5,4.2,sect.style==='startup'?'#587c92':sect.style==='mystery'?'#625d79':sect.style==='campus'?'#ad7860':'#42746d',1.2);
 textSign(g,sect.name+' · 聚义阁',0,4.6,-12.4,6,.9);
 textSign(g,sect.slogan||'—',0,3.6,-12.5,4.4,.45,'#f2ecd8','#6b6152');
 // 位次：创始人（主位居中抬高）
 seatFigure(g,{name:sect.founderName,title:'门派创始人',color:'#c8a24a',x:0,z:-8,elevated:true,bannerBg:'#f6e3bb'});
 // 长老阁（两侧列席）
 (sect.elders||[]).slice(0,6).forEach((e,i)=>{
  const side=i%2?1:-1,row=Math.floor(i/2);
  seatFigure(g,{name:e.name,title:e.title,color:'#7c9a8b',x:side*(5.2+row*3.4),z:-4+row*.4});
 });
 // 弟子（按称号从大到小分层列席：大师兄在前）
 ;[...(sect.disciples||[])].sort((a,b)=>discipleRank(a)-discipleRank(b)).slice(0,12).forEach((m,i)=>{
  const row=Math.floor(i/4),col=i%4;
  seatFigure(g,{name:m.name,title:m.title,color:'#6e8fb0',x:(col-1.5)*3.1,z:2+row*2.6});
 });
 // 返回大殿的门口
 const back=new T.Group();back.position.set(0,0,15);g.add(back);
 back.userData={kind:'sect-back'};if(interactive)interactive.push(back);
 dmesh(new T.BoxGeometry(5,.4,1.6),'#b7b8a7','stone',back,0,.2,0,2,.9);
 textSign(back,'返回门派大殿',0,1.4,.9,2.4,.5);
 return {dispose(){parent.remove(g);}};
}
