// 形象缩略图：用一个独立的小 three 场景把 GLB 实时渲染成预览图（不落资产文件）。
// 渲染一次后缓存 dataURL；模型缺失时退回 CSS 色块（由调用方决定占位）。
import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MODELS} from './config.js';

const cache=new Map();                       // modelKey → dataURL

export default function ModelThumb({modelKey,color='#427ab5',size=54}){
 const ref=useRef(null);
 const [img,setImg]=useState(()=>cache.get(modelKey)||null);

 useEffect(()=>{
  const el=ref.current;
  if(!el)return;
  if(cache.has(modelKey)){setImg(cache.get(modelKey));return;}
  const url=MODELS[modelKey];
  let stop=false,raf=0;
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(size*2,size*2,false);
  renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(32,1,.1,50);
  camera.position.set(0,.9,3.1);camera.lookAt(0,.85,0);
  scene.add(new T.HemisphereLight('#fff8e3','#9ba994',2.1));
  const key=new T.DirectionalLight('#fff1ce',2.4);key.position.set(1.6,2.4,2.2);scene.add(key);
  const rim=new T.DirectionalLight('#cfe0ff',1.1);rim.position.set(-2,1.4,-1.6);scene.add(rim);
  new GLTFLoader().load(url,gltf=>{
   if(stop){renderer.dispose();return;}
   const obj=gltf.scene;
   // 归一化：缩放到 1.5 高、脚下贴 y=0、水平居中，再按高度反推相机距离（不依赖模型原始尺度）。
   const box0=new T.Box3().setFromObject(obj),h0=box0.max.y-box0.min.y||1;
   obj.scale.setScalar(1.5/h0);
   const box1=new T.Box3().setFromObject(obj);
   const c=box1.getCenter(new T.Vector3());
   obj.position.x-=c.x;obj.position.z-=c.z;obj.position.y-=box1.min.y;
   const bx=new T.Box3().setFromObject(obj).getSize(new T.Vector3());
   const dist=1.5/Math.tan(16*Math.PI/180)*.62+.3;
   camera.position.set(.28,1.5*.6,dist);
   camera.lookAt(0,1.5*.6,0);
   scene.add(obj);
   renderer.render(scene,camera);
   const data=renderer.domElement.toDataURL('image/png');
   cache.set(modelKey,data);setImg(data);
   renderer.dispose();
  },undefined,()=>{renderer.dispose();});
  return()=>{stop=true;cancelAnimationFrame(raf);};
 },[modelKey,size]);

 if(img)return <img ref={ref} className="model-thumb-img" src={img} width={size} height={size} alt=""/>;
 // 没有预览图时：GLB 用袍子配色的描边小人占位，程序化角色用袍身色块
 return <span ref={ref} className={'model-thumb '+(MODELS[modelKey]?'glb':'proc')} style={{background:MODELS[modelKey]?color:'linear-gradient(155deg,#f4f1e6 46%,'+color+' 46%)'}}/>;
}
