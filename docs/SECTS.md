# 原子门派数据契约（与原子公社门派网站同步用）

阶段 39 起，门派数据由 `server/sects.mjs` 提供；后续接入**原子公社门派网站**的实时数据时，只需替换数据来源，不动 3D 与交互层。

## 现有接口（本项目）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sects?page=&size=` | 分页列表，默认每页 4 |
| GET | `/api/sects/:id` | 门派详情（含三角色） |
| POST | `/api/sects` | 建派 `{name,slogan,intro,style}`，需登录 |
| PATCH | `/api/sects/:id` | 改资料，仅创始人 |
| POST | `/api/sects/:id/layout` | 发布门派小镇布局（仅创始人），按预设白名单校验 |
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

## 接入原子公社门派网站（已实现，环境变量开启）

配置 `ATOM_SECTS_SOURCE`（网站 API 根地址，如 `https://atomhub.example.com/api`）即接入，**未配置时照旧走本地 `data/sects.json` 与内置演示数据**：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ATOM_SECTS_SOURCE` | 空 | 门派网站 API 根地址；请求 `${ATOM_SECTS_SOURCE}/sects` 拉取列表 |
| `ATOM_SECTS_SOURCE_TOKEN` | 空 | 需要鉴权时作为 `Authorization: Bearer <token>` 发送 |
| `ATOM_SECTS_TTL_MS` | 300000 | 同步周期（毫秒）；最小 5 秒 |

- 读取：远程站点为权威，按 TTL 周期刷新（`server/sects-source.mjs`）。拉取失败**保留上一次快照**（网站抖动时大殿照常开门），并把错误写进 `GET /api/sects/status` 与启动日志；冷启动先用 `data/sects-cache.json` 兜底。每条数据单独映射，坏行只跳过不计整批失败（跳过数量在 status 里可见）。
- 映射：远程字段名可以是 `sectId/sectName/tagline/description/theme/leader/council/members`，也可以是本文上面那套字段（`id/name/slogan/intro/style/founder/elders/disciples`）。响应形态认 `{sects:[…]}`、`{items/data/list:[…]}` 与裸数组。`members` 按称号分堆进弟子/长老，并与显式的 `elders`/`disciples` 去重；称号不在预设内按身份兜底；`style` 非法退回 `jianghu`。
- 写入：网站暂未开放管理接口，因此本地建派/改资料/加减成员**记录进覆盖层** `data/sects-overlay.json`（本机新建的门派 + 按 id 的字段补丁），每次远程刷新后重新贴回远程数据上——远程站点改了别的字段不会被本地旧值顶掉；远程删除的门派随之消失（远程权威）。等网站开放管理接口后，把 `persist()` 改成转发即可，3D 与前端不动。
- 运维：`GET /api/sects/status` 返回同步状态（来源/条数/上次同步时间/错误/跳过数/本地改动数）；`POST /api/sects/refresh`（需登录）手动触发一次同步。分页响应里也带 `source` 字段，前端能看出当前是不是远程数据。

`server/sects.mjs` 的替换点（`loadSects()`/`findSect()`/`pageSects()` 与写入函数 `persist()`）已按此接好；`server/sects-api.mjs`、`src/world/sectScene.js` 与前端流程无需改动。纯静态部署（没有服务端）走前端本机演示层 `src/world/sectStore.js`，与本文字段一致。
