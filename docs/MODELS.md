# 3D 模型接入指南（GLB）

原子江湖的角色默认使用程序化几何模型（黑斗笠、白衣、蓝衣带、佩剑）。把正式美术资产放入 `public/models/` 并在 `src/world/config.js` 的 `MODELS` 清单中登记，即可替换——无需改动场景代码。

## 快速替换

1. 把角色模型放到 `atom-jianghu/public/models/` 下，例如 `character-default.glb`。
2. 确认 `src/world/config.js` 的清单指向它（当前已启用示例基线）：

```js
export const MODELS={
 'character.default':'/models/character-default.glb',
};
```

3. 刷新页面。加载失败或文件缺失时会自动回退程序化角色，界面不报错、场景不空白。

## 当前示例基线

`public/models/character-default.glb` 是由 `scripts/export-sample-glb.mjs` 从程序化角色导出的**占位基线**（约 160KB，无动画），用途是验证管线通畅。正式资产直接覆盖此文件即可。

重新生成示例：

```bash
node scripts/export-sample-glb.mjs   # 需要能启动本地 dev 服务
```

验证两种形态（有模型 / 缺失回退）：

```bash
npm run test:e2e-glb
```

## 正式资产规范（对照 PRD 14.1）

- **格式**：GLB（二进制 glTF），单位米，脚底原点（y=0），面朝 +Z。
- **骨架与动画**：首发角色优先共用兼容骨架；必备动画 `idle`、`walk`，建议 `talk`、`listen`、`observe`。动画按**名称**识别（包含 `idle`/`walk` 即可，大小写不敏感），行走时播放 walk、静止时播放 idle。
- **无动画的模型**：使用根节点兜底动画（起伏与转向），与程序化角色一致的"活着"感。
- **尺度**：与现有场景匹配（角色总高约 1.7 米）；明显偏大或偏小会导致名牌浮空或陷入地面。
- **材质**：标准 PBR 材质；注意 GLB 外观固定，**衣带色自定义仅对程序化角色生效**（GLB 角色使用模型固有配色）。
- **建筑**：暂保持程序化（入口、碰撞与导航锚点依赖 `config.js` 配置）；建筑模型接入需要同步更新导航描述，属于后续阶段。

## 清单键

| 键 | 用途 | 当前状态 |
| --- | --- | --- |
| `character.default` | 所有角色（玩家、AI 侠客、联机远程玩家）的默认模型 | 示例 GLB 已启用；删掉该行即回退程序化 |

后续可扩展按角色或按建筑分键（如 `character.ayuan`、`building.hall`），加载与回退逻辑不变。

## 排错

- 页面无角色但场景正常：模型加载失败已回退程序化——按 `F12` 看 Console 是否有 404；`window.__atomModels` 会显示 `{loaded, failed}`。
- 角色陷地或浮空：模型原点不在脚底或尺度不符，修资产后重新覆盖。
- 动画不播：检查动画命名是否包含 `idle`/`walk`。
