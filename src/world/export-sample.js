// 资产管线工具：把程序化角色导出为 GLB 基线模型。
// 由 scripts/export-sample-glb.mjs 在浏览器上下文中调用（需要 three 的模块解析）。
// 正式资产替换时，用同样规范导出的 GLB 覆盖 public/models/ 下的文件即可。
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {character} from './models.js';

export async function exportCharacterGLB(color='#427ab5'){
 const model=character(color,1);
 model.updateMatrixWorld(true);
 const exporter=new GLTFExporter();
 const result=await exporter.parseAsync(model,{binary:true});
 return new Uint8Array(result);
}
