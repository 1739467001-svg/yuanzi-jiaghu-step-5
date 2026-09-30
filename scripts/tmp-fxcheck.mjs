// 诊断：点击空地 vs 点击水面，特效是否都出现（用户反馈点击地面没特效）。
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';

function dec(file){
 const u8=Buffer.from(fs.readFileSync(file));let p=8,w,h,ct;const id=[];
 while(p<u8.length){
  const len=u8.readUInt32BE(p);p+=4;const t=u8.toString('latin1',p,p+4);p+=4;const d=u8.subarray(p,p+len);p+=len+4;
  if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}else if(t==='IDAT')id.push(Buffer.from(d.buffer,d.byteOffset,d.byteLength));}
 const ch=ct===6?4:4,st=w*ch,raw=zlib.inflateSync(Buffer.concat(id)),out=Buffer.alloc(h*st);let rp=0;
 for(let y=0;y<h;y++){
  const f=raw[rp++],cur=out.subarray(y*st,(y+1)*st),pv=y>0?out.subarray((y-1)*st,y*st):null;
  for(let x=0;x<st;x++){
   const a=x>=ch?cur[x-ch]:0,b=pv?pv[x]:0,c=pv&&x>=ch?pv[x-ch]:0;let v=raw[rp+x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;
   else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
   cur[x]=v&255;}
  rp+=st;}
 return {w,h,ch,d:out};
}
function diff(a,b){
 const A=dec(a),B=dec(b);let changed=0,max=0;
 for(let y=0;y<A.h;y++)for(let x=0;x<A.w;x++){
  const i=(y*A.w+x)*A.ch;
  const la=A.d[i]*.3+A.d[i+1]*.59+A.d[i+2]*.11,lb=B.d[i]*.3+B.d[i+1]*.59+B.d[i+2]*.11;
  if(Math.abs(lb-la)>26){changed++;if(lb-la>max)max=lb-la;}}
 return {changed,max:Math.round(max)};
}
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto(base);
await page.waitForSelector('.scene-pin.player');
await page.waitForTimeout(2500);
const geo=await page.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
await page.screenshot({path:'/tmp/a1.png'});
await page.mouse.click(geo.x+geo.w*.5,geo.y+geo.h*.62);
await page.waitForTimeout(90);
await page.screenshot({path:'/tmp/a2.png'});
console.log('点击空地 →',JSON.stringify(diff('/tmp/a1.png','/tmp/a2.png')));
await page.screenshot({path:'/tmp/b1.png'});
await page.mouse.click(geo.x+geo.w*.5,geo.y+geo.h*.545);
await page.waitForTimeout(90);
await page.screenshot({path:'/tmp/b2.png'});
console.log('点击水面 →',JSON.stringify(diff('/tmp/b1.png','/tmp/b2.png')));
await browser.close();
