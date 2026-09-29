// 门派 3D 场景构建器（本地演示与联机世界共用）：
// 1) buildSectsHall：门派大殿——每页 4 座门派牌坊，按 style 着色，匾额写门派名，
//    左右翻页台（userData.kind='sect-page'，dir=-1/+1）。
// 2) buildSectInterior：门派内景——聚义阁式层级：
//    创始人主位居中抬高 → 长老阁两侧 → 弟子按称号分层列席（大师兄/二师兄在前）。
// 所有可点击对象挂 userData：{kind:'sect',id} / {kind:'sect-page',dir} / {kind:'sect-back'}。
import * as T from 'three';
import {THEMES} from './config.js';
import {box,ball,cylinder,dmesh,material,textSign,roof,figureHead,lantern} from './models.js';

const ROLE_ORDER=['大师兄','二师兄','大师姐','二师姐','师弟','师妹','弟子'];
function discipleRank(m){
 const i=ROLE_ORDER.indexOf(m.title);
 return i<0?ROLE_ORDER.length:i;
}
// 大殿地面/台基 + 门前陈设（红毡、灯笼、招贤幡）
function hallFloor(parent,palette,night){
 const g=new T.Group();parent.add(g);
 dmesh(new T.BoxGeometry(46,.5,34),night?'#4a5a52':'#b9c8a3','grass',g,0,-.25,0,12,.98);
 dmesh(new T.BoxGeometry(46,.2,34),'#c3bfa7','stone',g,0,.05,0,12,.95);
 // 红毡甬道：从门口直通牌坊前
 dmesh(new T.BoxGeometry(7,.07,20),'#8d3b34','plaster',g,0,.13,4,2,.9);
 dmesh(new T.BoxGeometry(7.4,.05,20.2),'#a8683f','plaster',g,0,.11,4,2,.9);
 // 甬道旁的石灯
 for(const sx of [-1,1])for(const z of [8,2,-4]){cylinder(g,sx*4.6,1.1,z,.24,.3,1.6,'#a9a693',10);ball(g,sx*4.6,2.05,z,.34,'#e8b46a',[.9,1.1,.9]);if(night){const l=new T.PointLight('#ffb15f',2.6,6);l.position.set(sx*4.6,2,z);parent.add(l);}}
 // 招贤幡：欢迎各门派
 for(const sx of [-1,1]){cylinder(g,sx*8.5,3.2,13.6,.07,.08,6.4,'#6d5943',8);box(g,sx*8.5,5.4,13.6,1.5,2.6,.06,sx<0?'#c8a24a':'#8d3b34');}
 box(g,-8.5,4.6,13.55,1.2,.9,.08,'#f2ecd8');box(g,8.5,4.6,13.55,1.2,.9,.08,'#f2ecd8');
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
// 太师椅：普通座椅就好——坐垫、靠背、扶手，四脚扎实。face 决定人和椅子朝哪边。
function chair(parent,x,z,face,elevated=false){
 const g=new T.Group();g.position.set(x,0,z);g.rotation.y=face;parent.add(g);
 const seat=elevated?.95:.62,c=(elevated?'#7c5f3a':'#6d4f33');
 if(elevated)dmesh(new T.BoxGeometry(2.3,.34,1.7),'#a8884f','wood',g,0,seat/2,0,2,.75);
 for(const [dx,dz] of [[-.55,-.42],[.55,-.42],[-.55,.42],[.55,.42]])box(g,dx,seat/2,dz,.12,seat,.12,c);
 dmesh(new T.BoxGeometry(1.34,.17,1.2),'#8d3b34','plaster',g,0,seat+.09,0,2,.9);           // 红坐垫
 box(g,0,seat+.62,-.52,1.34,1.02,.14,elevated?'#8a5a2a':'#7a3a2c');                            // 靠背
 box(g,0,seat+1.16,-.52,1.12,.12,.1,'#a8683f');
 box(g,0,seat+.62,-.52,1.2,.16,.06,'#c8a24a');                                                  // 靠背金线
 for(const sx of [-1,1]){box(g,sx*.76,seat+.62,0,.15,.15,1.05,elevated?'#8a5a2a':'#7a3a2c');box(g,sx*.76,seat+.72,.42,.18,.2,.18,'#a8683f');}
 return g;
}
// 门派内景：创始人主位 → 长老阁 → 弟子列席
// face 决定人物脸的朝向：创始人面向大殿（+z），长老斜向中前方，弟子面向主位（-z）。
function seatFigure(parent,{name,title,color,x,z,y=0,elevated=false,bannerBg,face=0},interactive=[]){
 const g=new T.Group();g.position.set(x,y,z);g.rotation.y=face;parent.add(g);
 chair(g,0,0,0,elevated);
 const h=elevated?1.42:.86;
 // 人物（程序化原子侠，用主角色同一套头部：有眼睛、有微笑）
 const body=new T.Group();body.position.y=h;g.add(body);
 cylinder(body,0,.47,0,.28,.39,.57,'#f5eee0');cylinder(body,0,.39,0,.36,.37,.1,color);
 figureHead(body,color);
 const arms=[ball(body,-.36,.62,0,.18,'#f3eee3',[.8,1.2,.8]),ball(body,.36,.62,0,.18,'#f3eee3',[.8,1.2,.8])];
 for(const ax of [-.37,.37]){cylinder(body,ax,.5,.02,.145,.145,.09,color);ball(body,ax,.74,.34,.11,'#f3eee3');}
 // 腿：坐姿——大腿前伸、小腿垂下
 for(const sx of [-.16,.16]){cylinder(body,sx,.22,.26,.13,.14,.5,'#f5eee0');cylinder(body,sx,.12,-.02,.13,.12,.24,'#5a4a38');}
 g.userData={kind:'sect-seat',id:x+'/'+z,name,title,role:title,
  // 点击座位：人转过来面向走近的少侠（脸的朝向随位置而不同）
  faceTo:(dx,dz)=>{g.userData.targetRot=Math.atan2(dx,dz);}};
 if(interactive)interactive.push(g);
 // 称号牌（聚义阁位次的名牌）
 textSign(g,`${title} · ${name}`,0,h+2.05,.72,elevated?2.8:2.1,.42,bannerBg||'#eadfc2',elevated?'#8a5a2a':'#324e46');
 return g;
}
// 聚义阁内的陈设：四壁立柱、匾额、灯笼、红毡、屏风、兵器架、花瓶——不再是家徒四壁。
function hallDecor(parent,palette,night){
 const wall=night?'#4a5a52':'#efe6cc';
 // 左右山墙（带窗洞）
 for(const sx of [-1,1]){
  dmesh(new T.BoxGeometry(1,6,32),wall,'plaster',parent,sx*15,3,0,3,.94);
  dmesh(new T.BoxGeometry(1.2,.7,32),'#7c6a4c','wood',parent,sx*15,6.1,0,2,.9);
  for(const z of [-7,0,7]){box(parent,sx*15.6,4.4,z,1.1,1.7,2.6,night?'#2b3a44':'#cfe0d6');box(parent,sx*15.5,4.4,z,1.2,.1,2.7,'#8a6b45');}
 }
 // 前檐两柱 + 门楣
 for(const sx of [-1,1]){dmesh(new T.CylinderGeometry(.42,.46,6.2,12),'#8a2f2a','plaster',parent,sx*11,3.1,13,2,.9);dmesh(new T.BoxGeometry(1,5.6,.6),'#7a3a2c','wood',parent,sx*11,3.4,12.6,2,.9);}
 dmesh(new T.BoxGeometry(25,.9,.8),'#7a3a2c','wood',parent,0,6.5,13,2,.9);
 textSign(parent,'聚 义 阁',0,5.1,13.2,6,.9);
 // 红毡：从门口铺到主位前
 dmesh(new T.BoxGeometry(4.6,.06,20),'#8d3b34','plaster',parent,0,.04,1,2,.9);
 dmesh(new T.BoxGeometry(5,.06,20.2),'#a8683f','plaster',parent,0,.02,1,2,.9);
 // 灯笼四盏
 for(const [x,z] of [[-10.4,11.6],[10.4,11.6],[-10.4,-2],[10.4,-2]]){lantern(parent,x,3.6,z);if(night){const l=new T.PointLight('#ffb15f',3.4,7);l.position.set(x,3.4,z);parent.add(l);}}
 // 主位屏风（创始人背后）
 dmesh(new T.BoxGeometry(7.4,4.4,.4),'#8d3b34','plaster',parent,0,2.2,-11.4,2,.9);
 dmesh(new T.BoxGeometry(7.8,.4,.7),'#a8683f','wood',parent,0,4.5,-11.4,2,.85);
 box(parent,0,2.5,-11.1,1.5,1.5,.06,'#e8dcc0');box(parent,0,2.5,-11.05,.9,.9,.08,'#c8a24a');
 // 兵器架（左右靠墙）
 for(const sx of [-1,1]){
  box(parent,sx*13.6,1.9,-9,1.2,.12,.12,'#6d4f33');box(parent,sx*13.6,1.9,-8.4,.12,2.4,.12,'#6d4f33');
  for(const z of [-9.6,-9,-8.4]){cylinder(parent,sx*13.6,3.1,z,.05,.05,1.6,'#8f8578',6);}
 }
 // 花瓶与盆栽
 for(const [x,z] of [[-12.5,-10.5],[12.5,-10.5],[-12.5,11.5],[12.5,11.5]]){
  cylinder(parent,x,.6,z,.28,.34,.9,'#5d7a63',10);ball(parent,x,1.1,z,.42,'#7fa06a',[.7,.8,.7]);
 }
 // 弟子席前的长桌与茶具
 for(const z of [3.6,6.2]){
  box(parent,0,.85,z,10.5,.12,1.1,'#8a6b45');box(parent,0,.83,z,10.8,.06,1.15,'#a8783f');
  for(const x of [-4.6,0,4.6])for(const dz of [-.45,.45])box(parent,x,.42,z+dz,.16,.84,.16,'#6d4f33');
  for(const x of [-3.2,0,3.2]){cylinder(parent,x,1.02,z,.16,.13,.14,'#f0ece0',10);}
 }
}
export function buildSectInterior(parent,{sect,palette,night},interactive=[]){
 const g=new T.Group();parent.add(g);
 hallFloor(g,palette,night);
 const style=sect.style==='startup'?'#587c92':sect.style==='mystery'?'#625d79':sect.style==='campus'?'#ad7860':'#42746d';
 // 聚义阁主厅：后壁 + 匾额
 dmesh(new T.BoxGeometry(30,.6,4),'#eee2c5','plaster',g,0,.3,-13,4,.92);
 roof(g,31,5,4.2,style,1.2);
 textSign(g,sect.name+' · 聚义阁',0,4.6,-12.4,6,.9);
 textSign(g,sect.slogan||'—',0,3.6,-12.5,4.4,.45,'#f2ecd8','#6b6152');
 hallDecor(g,palette,night);
 const seats=[];
 // 位次：创始人（主位居中抬高，面向大殿）
 seats.push(seatFigure(g,{name:sect.founderName,title:'门派创始人',color:'#c8a24a',x:0,z:-8,elevated:true,bannerBg:'#f6e3bb',face:0},interactive));
 // 长老阁（两侧列席，斜向中前方，正对大殿）
 (sect.elders||[]).slice(0,6).forEach((e,i)=>{
  const side=i%2?1:-1,row=Math.floor(i/2);
  seats.push(seatFigure(g,{name:e.name,title:e.title,color:'#7c9a8b',x:side*(5.2+row*3.4),z:-4+row*.4,face:-side*.42},interactive));
 });
 // 弟子（按称号从大到小分层列席：大师兄在前，面向主位）
 ;[...(sect.disciples||[])].sort((a,b)=>discipleRank(a)-discipleRank(b)).slice(0,12).forEach((m,i)=>{
  const row=Math.floor(i/4),col=i%4;
  seats.push(seatFigure(g,{name:m.name,title:m.title,color:'#6e8fb0',x:(col-1.5)*3.1,z:2+row*2.6,face:Math.PI},interactive));
 });
 // 返回大殿的门口
 const back=new T.Group();back.position.set(0,0,15);g.add(back);
 back.userData={kind:'sect-back'};if(interactive)interactive.push(back);
 dmesh(new T.BoxGeometry(5,.4,1.6),'#b7b8a7','stone',back,0,.2,0,2,.9);
 textSign(back,'返回门派大殿',0,1.4,.9,2.4,.5);
 return {dispose(){parent.remove(g);},seats};
}
