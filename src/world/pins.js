// 场景名牌（可点击浮标）的窄屏避让：小屏幕上建筑挨得近，两个标容易叠在一起。
// 做法不是"藏起来"（那会让人找不到门派入口），而是把后一个往上/下挪一档，直到不叠；
// 实在没地方放的才暂时不显示。「你在这里」永远保留，并且优先安置。
const OFFSETS=[0,68,-68,136,-136];
export function declutterPins(pins,minDist=44){
 const order=[...pins].sort((a,b)=>(b.kind==='player')-(a.kind==='player'));
 const placed=[];
 for(const pin of order){
  let done=false;
  for(const dy of OFFSETS){
   const candidate={...pin,y:pin.y+dy};
   const clash=placed.some(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y)<minDist);
   if(!clash){placed.push(candidate);done=true;break;}
  }
  if(!done&&pin.kind==='player')placed.push(pin);   // 自己的位置标总会留下
 }
 return placed;
}
