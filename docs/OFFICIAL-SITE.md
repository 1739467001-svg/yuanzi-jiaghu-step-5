# 原子公社官网调研与对接文档（atomclub.cn）

> 采集时间：2026-10-17。采集方式：官网前端包源码分析（React/Vite SPA）+ 线上 API 实测探测（curl）。
> 说明：采集期间主站 JS 资产曾因部署瞬态 404，稍后恢复；本文所有 API 形态均为当日实测响应。
> 浏览器自动化（AutoGLM）因本机扩展被禁用未能走通，改用「源码 + 接口探测」——对对接目标而言这反而更实（拿到的是契约而不是截图）。

---

## 1. 站点全景：三个域，两个系统

原子公社线上由**三个域**组成，分属两个系统：

| 域 | 系统 | 定位 |
| --- | --- | --- |
| `atomclub.cn` | **原子公社社区站** | "AI时代超级个体协作社区"——人与 Agent 共建的开源学习社区（活动、门派、茶楼、任务、经济系统） |
| `atengin.atomclub.cn` | **原子引擎**（文档站/模型广场/控制台入口） | "推动生产关系变革的智慧底座"——垂直个体商业协作的 MaaS（Model-as-a-Service）平台 |
| `api.atomclub.cn` | 原子引擎的 API 网关（New API 实例） | OpenAI 兼容的模型 API 出口，Bearer Key 鉴权 |

另有素材 CDN：`atompub.oss-cn-beijing.aliyuncs.com`（头像/封面/门店图标），视频图片产物走 `cdn.atengin.atomclub.cn`。商务邮箱：`maitemight@atomclub.cn`。父品牌站：`atomesh.cn`（关于原子之心）。

---

## 2. 社区站（atomclub.cn）：栏目与功能

### 2.1 前端路由全貌（从前端包解析，31 条）

| 路由 | 功能 |
| --- | --- |
| `/` | 首页（热门活动 / 热门帖子 / 推荐门派） |
| `/events`、`/events/new`、`/events/:eventId`、`/events/:eventId/manage` | 活动：列表、创建、详情、**管理台**（报名审核/签到） |
| `/news` | AI 资讯流（外采：量子位、Fun AI Everyday 等） |
| `/notifications` | 通知中心 |
| `/profile`、`/profile/:userId`、`/profile/edit` | 个人主页与编辑 |
| `/profile/:userId/followers|following`、`/profile/:userId/traces` | 关注者/关注中、**活动足迹** |
| `/profile/:userId/wallet`、`/profile/medals`、`/profile/shop` | **原子币钱包**、勋章、商店 |
| `/ranking`、`/ranking/rules` | 风云榜（侠客榜/门派榜）与规则 |
| `/sects`、`/sects/new`、`/sects/:sectId` | 门派：大厅、创建、详情 |
| `/sects/:sectId/channel|edit|goals/new|members` | 门派频道、编辑、**周/月目标**、成员 |
| `/tasks` | 任务中心（每日签到/连签/成就） |
| `/teahouse`、`/teahouse/:postId`、`/teahouse/new` | 茶楼：帖子列表、详情、发帖 |
| `/wechat/oauth-callback` | 微信 OAuth 回调 |

### 2.2 功能模块详解

**账号体系**：手机号 + 验证码登录（`/auth/send-code`）、微信 OA 绑定（`/auth/wechat-oa/bind`）。注册关闭（邀请/运营制），密码登录在引擎站侧开启。

**活动（Events）**：类型七种——`黑客松`、`技术沙龙`、`沙龙分享`、`创业大赛`、`OPC大赛`、`Coffee Chat`、`offline`。全站累计 350 场（技术沙龙 178 / 黑客松 59 / 沙龙分享 44 / offline 28 / 创业大赛 27 / OPC 大赛 12 / Coffee Chat 2）。主办方含淘宝、千问大模型、阿里云、深圳科创学院、湖畔良仓等。活动有报名（enrolled/capacity）、扫码签到、管理后台。

**门派（Sects）**：社区的基本组织单位，与我们的「江湖原子门派」同构。官网门派字段：`id/name/slogan/intro/memberCount/tags/activity/joinType(open|apply|invite)/score/hue/coverUrl/logo`。首个示范门派即「原子公社」本身（slogan：**让 Token，人人可用**；12 名成员；tags：AI开源学习社区、AI实践与应用）。标签云含 vibecoder、AI黑客松、OPC、大学生等。门派内有频道、周目标/月目标、成员管理。

**茶楼（Teahouse）**：社区 UGC 帖子流（作者带 Tag 如「原子之心联合创始人」、头像、色相），有热门榜。

**任务与经济系统**：
- **原子币**：虚拟货币。任务奖励 = 原子币 + 经验（如每日签到 +20 币 +10 经验，连签 30 天 +300 币 +200 经验）；
- **等级体系**：`level/levelTitle`（如「初入江湖」）、likes、followers、coins（实测用户 Might：3029 币）；
- **商店**：周边兑换（帆布袋 1888 币，category/stock/sold/hot）；
- **勋章**（badges/medals）与**钱包**（coin-records 流水）。

**排行榜**：侠客榜（knights：personaTag、skills、level、likes、followers、coins）、门派榜（sects：memberCount、score）、奖励（rewards）。

**资讯**：`/api/news` 外链聚合（量子位等），source + link 形态。

### 2.3 社区站 API 一览（实测可用，均无需登录）

| 分组 | 端点 |
| --- | --- |
| 首页 | `GET /api/home/hot-events`、`/api/home/hot-posts`、`/api/home/rec-sects` |
| 鉴权 | `POST /api/auth/login`、`/api/auth/logout`、`/api/auth/send-code`、`/api/auth/wechat-oa/bind` |
| 活动 | `GET /api/events`（分页 list）、`/api/events/types`、`/api/events/stats`、`/api/events/:id`；`POST /api/events/new` |
| 门派 | `GET /api/sects`（分页）、`/api/sects/active`、`/api/sects/tag-cloud`、`/api/sects/:id`；`POST /api/sects/new` |
| 茶楼 | `GET /api/teahouse/posts`（分页）、`/api/teahouse/posts/hot`、`/api/teahouse/:postId`；`POST /api/teahouse/new` |
| 任务 | `GET /api/tasks`、`POST /api/tasks/checkin` |
| 排行 | `GET /api/ranking/knights`、`/api/ranking/sects`、`/api/ranking/rewards` |
| 用户 | `GET /api/user/me`、`/api/user/badges`、`/api/user/coin-records`、`/api/user/event-traces`、`/api/user/sects/joined`、`/api/user/sect`、`/api/user/social-links`、`POST /api/user/upload-image` |
| 通知 | `GET /api/user/notifications`、`/api/user/notifications/unread-count`；`POST /api/user/notifications/read-all` |
| 商店 | `GET /api/shop/items`、`/api/profile/shop`、`/api/profile/medals`、`GET /api/profile/user_me/wallet` |
| 资讯 | `GET /api/news` |

分页形态：`{"list":[...]}`（含 total 等字段）；列表形态：裸数组。需登录端点返回 `{"error":{"code":"VALIDATION_ERROR","message":"Unauthorized"}}`。

---

## 3. 原子引擎（api.atomclub.cn / atengin.atomclub.cn）：MaaS 平台

### 3.1 定位与规模

"面向个体商业协作场景的 AI 模型服务，编排式接入、按需调用、弹性扩缩容"。官方口径：已接入 50+ 模型（页面宣传 100+ 预置模型能力）、99.9% 可用性、平均响应 <100ms。技术底座是 **New API**（开源 LLM 网关，`x-new-api-version` 头可见），网关地址 `https://atengin.atomclub.cn/v1`（`server_address` 配置为 engine.atomesh.cn，atomclub.cn 为对外镜像）。

### 3.2 模型清单（模型广场实测）

- **提供商 7 家**：通义千问 21、DeepSeek 10、智谱 6、百度 6、MiniMax 5、Moonshot 4、StepFun 1（合计 53）。
- **能力分类**：文本生成 40、推理模型 30、图片理解 6、代码生成 4、多模态 1、智能体 2。
- 生态合作方（首页展示）：DeepSeek、Moonshot、智谱 AI、通义千问、MiniMax、阶跃星辰。

### 3.3 API 全景（文档站 atengin.atomclub.cn/docs 整理）

统一 `Authorization: Bearer <API_KEY>`；base：`https://atengin.atomclub.cn/v1`。

| 线 | 端点数 | 端点 |
| --- | --- | --- |
| **文本** | 13 | `POST /v1/chat/completions`（OpenAI 兼容）、`POST /v1/messages`（Anthropic 兼容）、`POST /v1/responses`（Responses API）、`POST /v1/gemini/chat`、`POST /v1/completions`、`POST /v1/embeddings`、`POST /v1/rerank`、`POST /v1/moderations`、`GET /v1/models`、`GET /v1/gemini/models`、`POST /v1/gemini/relay`、`WS /v1/realtime`（实时对话）、多模态 Gemini |
| **图像** | 6 | `POST /v1/images/generations`、`POST /v1/images/edits`、通义系列生图/编辑、Gemini 生图/图片对话 |
| **语音** | 4 | `POST /v1/audio/speech`（TTS）、`/v1/audio/transcriptions`（ASR）、`/v1/audio/translations`（翻译）、Gemini TTS |
| **视频** | 10 | `POST /v1/video/generations`（任务式，轮询 `GET /v1/video/generations/{task_id}`）、`/v1/videos/text2video`、`/v1/videos/image2video`（可灵 relay）、`GET /v1/video/content/{task_id}`、即梦 relay 等 |
| 其他 | — | `POST /v1/files`、微调（fine-tunes）系列 |

产物走 CDN：`cdn.atengin.atomclub.cn/images|video/...`。

### 3.4 计费与运营

- 配额制：`quota_per_unit=500000`（1 元 = 50 万配额），展示货币 CNY；支持兑换码（redemption）、充值（topup）；
- 注册关闭（`register_enabled=false`），密码登录开启；GitHub/Discord/Telegram/LinuxDO/OIDC/微信登录均未启用（Passkey 配置了但登录关闭）——**外部身份接入点对官方是开放问题**；
- 控制台模块：聊天 Playground、调用明细、令牌、日志；管理端：渠道、模型、部署、兑换码、用户、订阅、设置；
- 文档站栏目：模型广场（pricing）、文档（docs）、生态合作（partners）、关于原子之心、加入原子公社。

### 3.5 生态合作计划（partners 页）

四类伙伴：个体开发者（API 接入资格、新模型首发、流量扶持）、企业（定制部署、SLA、联合方案）、渠道代理（返佣、培训认证）、生态社区（联合运营、内测、署名）。权益含全链路技术赋能、专属算力与阶梯定价、联合推广、官方认证。

---

## 4. 与我们系统（原子江湖）的对接评估

### 4.1 已经就绪的对接点（改配置即可用）

| 我们的能力 | 对接对象 | 现状 |
| --- | --- | --- |
| AI 私聊/大脑模型（`ATOM_LLM_BASE_URL` + Key） | 原子引擎 `https://atengin.atomclub.cn/v1` | **立即可用**：OpenAI 兼容，把 base 指向它、填 Key 即可；预算账本与降级逻辑已具备 |
| 嵌入召回（`ATOM_EMBEDDING_*`） | 原子引擎 `/v1/embeddings` | 同上，配置即切换向量召回 |
| 门派远程数据源（`ATOM_SECTS_SOURCE`） | 社区站 `/api/sects` | **✅ 已打通（2026-10-17 实测）**：一行配置 `ATOM_SECTS_SOURCE=https://atomclub.cn/api`，6 个真实门派进 3D 大殿、封面经同源代理渲染；`joinType→joinPolicy` 别名与富字段透传已落地，详见 [THREE_D_INTEGRATION.md](THREE_D_INTEGRATION.md)：我们的 `mapRemoteSect` 已认 `name/sectName`、`founder/leader`、`elders/council`、`members` 别名；官网字段 `name/slogan/intro` 直接命中。**差异点**：官网用 `joinType(open/apply/invite)` 而我们用 `joinPolicy`（同义，需加别名）；官网独有 `memberCount/activity/score/hue/coverUrl/logo/tags`（我们模型没有，需扩契约或丢弃） |
| 门派大厅回跳（`VITE_SECT_HALL_URL`） | `https://atomclub.cn/sects/:id` | 配置即生效 |
| 运营后台赛事导入工作台 | 社区站 `/api/events` | **可扩展（方案已定）**：活动字段（title/type/status/startAt/location/organizer/enrolled/capacity/desc）与我们的 editions 赛事结构可映射；建议加一个「从官网拉活动」的导入源（dry-run 预览→确认导入，复用现有闭环） |
| 内容注入 | `/api/news`、`/api/teahouse/posts` | 可选：AI 资讯进「江湖此刻」或展示馆资讯位；茶楼热帖进小镇茶楼场景的话题气泡 |

### 4.2 需要与官方确认的事项（建议并入五个待拍板问题）

1. **身份打通**：社区站登录只有手机验证码 + 微信 OA，**未提供 JWT/OIDC**（引擎站 OIDC 开关关闭）。我们的 `ATOM_AUTH_MODE=external`（JWKS/内省）需要官方提供令牌签发方式——或由官方直接签发会话令牌给联机世界。
2. **原子币账本**：钱包流水（`/api/user/coin-records`）是否有对账接口？我们的「权益碑/邀请赠金」若要结算，需要读官方账本或接收回调。
3. **门派写回**：远程模式下我们只读 + 本地覆盖层；官网是否有门派管理 API（成员/目标/公告写回）？没有就维持覆盖层形态。
4. **活动报名/签到**：是否需要把小镇内的观展/参与行为回写官网活动（足迹 `/api/user/event-traces`）？
5. **模型计费归属**：联机世界的 AI 私聊若走原子引擎，费用记官方账本还是我们自付？影响预算门限设计。

### 4.3 数据契约差异明细（门派，给 sects-source 用）

| 官网字段 | 我们的字段 | 处理 |
| --- | --- | --- |
| `name/slogan/intro/style` | 同名 | 直接命中 |
| `leader`/`founder`（对象或名字） | `founderId/founderName` | 已有别名映射 |
| `elders/council`、`members` | `elders/disciples` | 已有别名映射（按称号分堆） |
| `joinType`（open/apply/invite） | `joinPolicy` | **需加别名**（同义不同名） |
| `memberCount/activity/score/hue/coverUrl/logo/tags` | 无 | **需扩契约**（建议至少收 `tags` 与 `coverUrl`：门派大殿可显示官网封面） |
| `createdAt` | 同名 | 直接命中 |

---

## 5. 复跑方法（调研可重复）

```bash
# 1. 主站前端包（路由/文案/端点名）
curl -s https://atomclub.cn/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
curl -s https://atomclub.cn/assets/index-<hash>.js -o app.js   # 部署瞬态可能 404，稍后重试
grep -oE 'path:\s*"[^"]+"' app.js | sort -u                    # 路由
grep -oE '"/api/[a-zA-Z0-9_/-]+"' app.js | sort -u             # 端点

# 2. 社区站 API 实测（多数免登录）
curl -s https://atomclub.cn/api/home/hot-events
curl -s https://atomclub.cn/api/sects/sect_<id>

# 3. 引擎站
curl -s https://api.atomclub.cn/api/status        # 平台配置（模块开关/计量/登录方式）
curl -s https://atengin.atomclub.cn/docs.html     # API 文档（静态页，含全部端点与示例）
```

注意：主站 JS 资产在部署过程中会短时 404（哈希已变、文件未就绪），几分钟后恢复；API 域名与文档域名分离，探测时都试。
