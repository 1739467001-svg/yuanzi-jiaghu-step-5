// PNG 透明边距裁剪 + 按空白列拆分（图标/字标）。
// 用途：把 Logo 文件夹里的真实 logo（大画布 + 留白）压成网页可直接用的紧凑资源，
// 并从真实 logo 里切出纯图标，替换界面上手绘的「印章」占位。
// 用法：node scripts/trim-logo.mjs <in.png> <out.png> [--split gap]
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePNG(file){
 const u8=fs.readFileSync(file);let p=8,w,h,bitDepth,colorType;const idat=[];
 while(p<u8.length){
  const len=u8.readUInt32BE(p);p+=4;
  const type=u8.toString('latin1',p,p+4);p+=4;
  const data=u8.subarray(p,p+len);p+=len+4;
  if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];}
  else if(type==='IDAT')idat.push(data);
  else if(type==='PLTE')throw new Error('不支持调色板 PNG');
 }
 if(bitDepth!==8)throw new Error('只支持 8 位 PNG');
 const ch=colorType===6?4:colorType===2?3:colorType===4?2:colorType===0?1:0;
 if(!ch)throw new Error('不支持的色彩类型 '+colorType);
 const stride=w*ch,raw=zlib.inflateSync(Buffer.concat(idat)),out=Buffer.alloc(h*stride);
 let rp=0;
 for(let y=0;y<h;y++){
  const f=raw[rp++],cur=out.subarray(y*stride,(y+1)*stride),prev=y>0?out.subarray((y-1)*stride,y*stride):null;
  for(let x=0;x<stride;x++){
   const a=x>=ch?cur[x-ch]:0,b=prev?prev[x]:0,c=prev&&x>=ch?prev[x-ch]:0;
   let v=raw[rp+x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;
   else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
   cur[x]=v&255;
  }
  rp+=stride;
 }
 return {w,h,ch,data:out};
}
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return (buf)=>{let c=0xffffffff;for(const b of buf)c=t[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};})();
function encodePNG(w,h,rgba){
 const raw=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){
  raw[y*(w*4+1)]=0; // filter 0
  rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
 }
 const chunk=(type,data)=>{
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const body=Buffer.concat([Buffer.from(type,'latin1'),data]);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len,body,crc]);
 };
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function alphaAt(img,x,y){const {ch,data}=img;return ch>=4?data[(y*img.w+x)*ch+3]:255;}
// 内容边界框（alpha>8 视为内容）
function contentBox(img){
 let x0=img.w,y0=img.h,x1=-1,y1=-1;
 for(let y=0;y<img.h;y++)for(let x=0;x<img.w;x++)if(alphaAt(img,x,y)>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 if(x1<x0)return null;
 return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}
function crop(img,box,outCh=4){
 const out=Buffer.alloc(box.w*box.h*outCh);
 for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){
  const si=((box.y+y)*img.w+(box.x+x))*img.ch, di=(y*box.w+x)*outCh;
  const px=img.data.subarray(si,si+img.ch);
  if(outCh===4){if(img.ch>=4){out[di]=px[0];out[di+1]=px[1];out[di+2]=px[2];out[di+3]=px[3];}else{out[di]=px[0];out[di+1]=px[1];out[di+2]=px[2];out[di+3]=255;}}
  else{out[di]=px[0];out[di+1]=px[1];out[di+2]=px[2];}
 }
 return out;
}
// 找横向空白列（整列 alpha≤8）中最宽的一段，作为图标与字标的分界。只在内容区间内找。
function splitColumns(img,minGap=8,from=0,to=img.w){
 const runs=[];let start=null;
 for(let x=from;x<to;x++){
  let empty=true;
  for(let y=0;y<img.h&&empty;y++)if(alphaAt(img,x,y)>8)empty=false;
  if(empty&&start===null)start=x;
  if((!empty||x===to-1)&&start!==null){runs.push({from:start,to:x-1,w:x-start});start=null;}
 }
 return runs.filter(r=>r.w>=minGap).sort((a,b)=>b.w-a.w)[0]||null;
}
function report(name,box,extra={}){
 console.log(JSON.stringify({file:name,content:`${box.w}x${box.h}`,ratio:+(box.w/box.h).toFixed(2),...extra}));
}
// 区域平均降采样（alpha 预乘，避免透明边缘出现黑边），用于把超清 logo 压到网页够用的尺寸。
function downscale(img,maxW){
 if(img.w<=maxW)return img;
 const w=maxW,h=Math.max(1,Math.round(img.h*maxW/img.w));
 const out=Buffer.alloc(w*h*4);
 const scale=img.w/w;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.floor(x*scale),x1=Math.min(img.w,Math.ceil((x+1)*scale));
  const y0=Math.floor(y*scale),y1=Math.min(img.h,Math.ceil((y+1)*scale));
  let r=0,g=0,b=0,a=0,n=0;
  for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++){
   const i=(sy*img.w+sx)*4,al=img.data[i+3]/255;
   r+=img.data[i]*al;g+=img.data[i+1]*al;b+=img.data[i+2]*al;a+=img.data[i+3];n++;
  }
  const di=(y*w+x)*4;
  if(a>0){out[di]=Math.round(r*n/a);out[di+1]=Math.round(g*n/a);out[di+2]=Math.round(b*n/a);}
  out[di+3]=Math.round(a/n);
 }
 return {w,h,ch:4,data:out};
}
const [, ,inFile,outFile,...flags]=process.argv;
const split=flags.includes('--split');
const maxFlag=flags.find(f=>f.startsWith('--max='));
const maxW=maxFlag?Number(maxFlag.split('=')[1]):0;
const img=decodePNG(inFile);
const box=contentBox(img);
if(!box){console.error(inFile+' 没有可见内容');process.exit(1);}
const trimmed={...box};
if(split){
 // 先量内容边界，再只在内容区间里找图标与字标之间的空白列。
 const boxAll=contentBox(img);
 const gap=splitColumns(img,8,boxAll.x,boxAll.x+boxAll.w);
 if(gap&&gap.from>boxAll.x&&gap.to<boxAll.x+boxAll.w-1){
  trimmed.w=gap.from-box.x;      // 图标：内容起点 → 空隙前
  console.log(JSON.stringify({iconEnd:gap.from,gapWidth:gap.w}));
 }else{
  console.log(JSON.stringify({note:'内容区间内没有可拆分的空白列，按整体处理'}));
 }
}
let rgba=crop(img,trimmed);
let size={w:trimmed.w,h:trimmed.h};
if(maxW&&size.w>maxW){
 const shrunk=downscale({w:size.w,h:size.h,ch:4,data:rgba},maxW);
 rgba=shrunk.data;size={w:shrunk.w,h:shrunk.h};
}
fs.writeFileSync(outFile,encodePNG(size.w,size.h,rgba));
report(inFile,trimmed,{out:`${outFile} ${size.w}x${size.h}`,bytes:fs.statSync(outFile).size});
