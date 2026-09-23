// GLB 资产接入：清单命中的模型替换程序化几何；未配置或加载失败回退程序化，不阻断场景。
// 带动画的 GLB 按 idle/walk 播放；无动画时对根节点应用程序化兜底动画（与行走起伏一致）。
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MODELS} from './config.js';
import {character} from './models.js';

const loader=new GLTFLoader();
const cache=new Map(); // url -> {scene, animations}
const failures=new Set();

export function modelUrl(key){
 const entry=MODELS[key];
 return entry&&typeof entry==='string'&&entry.startsWith('/')?entry:null;
}
export async function preloadModels(){
 const urls=[...new Set(Object.values(MODELS).filter(u=>typeof u==='string'&&u.startsWith('/')))];
 await Promise.all(urls.map(url=>new Promise(resolve=>{
  if(cache.has(url)||failures.has(url))return resolve();
  loader.load(url,gltf=>{cache.set(url,{scene:gltf.scene,animations:gltf.animations||[]});resolve();},undefined,()=>{failures.add(url);resolve();});
 })));
 const status={loaded:[...cache.keys()],failed:[...failures]};
 if(typeof window!=='undefined')window.__atomModels=status; // 测试与调试接缝
 return status;
}
export function hasGLB(key){const url=modelUrl(key);return !!url&&cache.has(url);}
// 取一个模型实例：命中返回 {object, animations}（调用方负责加入场景），未命中返回 null。
export function glbInstance(key){
 const url=modelUrl(key);
 if(!url||!cache.has(url))return null;
 const source=cache.get(url);
 const object=source.scene.clone(true);
 object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 return {object,animations:source.animations};
}
// 兜底动画：无 GLB 动画时驱动根节点起伏与转向，保持与程序化角色一致的“活着”的感觉。
export function applyFallbackMotion(object,now,moving){
 if(!object)return;
 object.position.y=moving?Math.abs(Math.sin(now*.009))*.055:Math.sin(now*.002+object.position.x)*.016;
 object.rotation.z=moving?Math.sin(now*.009)*.03:0;
}
// 动画混合器管理：每个实例一个 mixer，按状态切换 idle/walk。
export function createAnimator(object,animations){
 if(!object||!animations||!animations.length)return null;
 const mixer=new T.AnimationMixer(object);
 const clips={};
 for(const clip of animations){
  const name=clip.name.toLowerCase();
  if(name.includes('walk'))clips.walk=clip;
  else if(name.includes('idle'))clips.idle=clip;
 }
 if(!clips.walk&&!clips.idle)return null;
 let current=null;
 return {
  mixer,
  play(name){
   const clip=clips[name]||clips.idle||clips.walk;
   if(!clip||current===clip)return;
   const action=mixer.clipAction(clip);
   action.reset().play();
   current=clip;
  },
  update(dt){mixer.update(dt);},
 };
}
// 统一角色创建：清单命中返回 GLB 实例（附 animator），否则返回程序化角色。
// 返回对象的 userData.body/feet/arms 仅程序化角色有；GLB 角色用 userData.glb。
export function createCharacter(key,color,scale=1){
 const glb=glbInstance(key);
 if(glb){
  const object=glb.object;
  object.scale.setScalar(scale);
  object.userData.glb={animator:createAnimator(object,glb.animations)};
  return object;
 }
 return character(color,scale);
}
