# 原子门派数据契约（与原子公社门派网站同步用）

阶段 39 起，门派数据由 `server/sects.mjs` 提供；后续接入**原子公社门派网站**的实时数据时，只需替换数据来源，不动 3D 与交互层。

## 现有接口（本项目）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sects?page=&size=` | 分页列表，默认每页 4 |
| GET | `/api/sects/:id` | 门派详情（含三角色） |
| POST | `/api/sects` | 建派 `{name,slogan,intro,style}`，需登录 |
| PATCH | `/api/sects/:id` | 改资料，仅创始人 |
| POST | `/api/sects/:id/elders` | `{name,title}` 加入长老阁，仅创始人 |
| POST | `/api/sects/:id/disciples` | `{name,title}` 收入弟子，仅创始人 |
| POST | `/api/sects/:id/members/remove` | `{userId}` 移出成员，仅创始人 |

请求头：`x-atom-token: <会话令牌>`（本地身份亦可）。

## 门派对象

```json
{
  "id": "sect-xxxx",
  "name": "元气满满派",
  "slogan": "一起把想法做出来",
  "intro": "由内容创作者组成的小社区…",
  "style": "startup",
  "founderId": "u-1",
  "founderName": "创派祖师",
  "createdAt": 1730000000000,
  "elders":   [{ "userId": "u-2", "name": "青禾", "title": "执法长老" }],
  "disciples":[{ "userId": "u-3", "name": "阿原", "title": "大师兄" }]
}
```

- `style` 取自 `src/world/config.js` 的 `THEMES`：`jianghu` / `startup` / `mystery` / `campus`——决定门派大殿与内景的 3D 配色。
- 弟子称号预设：大师兄、二师兄、大师姐、二师姐、师弟、师妹、弟子；长老称号预设：长老、执法长老、传功长老、护法长老。
- 三角色层级（聚义阁式展示）：门派创始人（唯一，主位）→ 长老阁（两侧）→ 门派弟子（按称号分层列席）。

## 接入原子公社门派网站时的替换点

`server/sects.mjs` 的读取函数保持纯函数形态：

- `loadSects()` / `findSect(id)` / `pageSects(page,size)` → 改为拉取远程数据并按上面的字段映射；
- 写入函数（create/update/addElder/addDisciple/removeMember）→ 若以网站为唯一数据源，可改为转发到网站的管理接口；否则保持本地写入并按周期同步。

映射注意：远程站点若用不同字段名（如 `leader` / `members`），只在这几个函数内转换；`server/sects-api.mjs`、`src/world/sectScene.js` 与前端流程无需改动。
