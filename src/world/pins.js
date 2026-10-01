// 场景名牌的窄屏避让：小屏幕上建筑挨得近，标容易叠在一起。
// 不「藏标签」（那会让人找不到门派入口），而是按「盒子是否真的重叠」把后一个沿上/下/左/右
// 各档位挪，直到不叠；实在没位置放的才暂时不显示。「你在这里」永远保留且优先安置。
// 盒子尺寸按各类名牌的实测大小估算（地名标最宽 ~90px、高 ~29px）。
const BOX={place:[92,32],sect:[92,32],work:[130,32],agent:[46,32],player:[46,28],remote:[46,32]};
const sizeOf=k=>BOX[k]||[80,32];
// 两个名牌的盒子是否重叠（都带一点余量，别贴边）
function overlaps(a,b){
 const [aw,ah]=sizeOf(a.kind),[bw,bh]=sizeOf(b.kind);
 return Math.abs(a.x-b.x)*2<aw+bw+8 && Math.abs(a.y-b.y)*2<ah+bh+8;
}
// 偏移档位：先小步长（44px 已超过两个名牌的高度和一半），再逐步放大；水平也留几档。
const OFFSETS=[[0,0],[0,46],[0,-46],[0,92],[0,-92],[52,0],[-52,0],[0,138],[0,-138],[104,46],[-104,46],[0,184],[0,-184]];
export function declutterPins(pins){
 const order=[...pins].sort((a,b)=>(b.kind==='player')-(a.kind==='player'));
 const placed=[];
 for(const pin of order){
  let done=false;
  for(const [dx,dy] of OFFSETS){
   const candidate={...pin,x:pin.x+dx,y:pin.y+dy};
   if(!placed.some(p=>overlaps(candidate,p))){placed.push(candidate);done=true;break;}
  }
  if(!done&&pin.kind==='player')placed.push(pin);
 }
 return placed;
}
