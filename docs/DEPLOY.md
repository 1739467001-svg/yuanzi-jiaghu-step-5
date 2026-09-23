# 部署指南（云服务器）

原子江湖的完整联机体验（内容/鉴权/记忆/聊天 API + 权威世界 WebSocket）以**一个 Node 进程**运行，不依赖 Vite dev 服务。本文覆盖从构建到上线的完整步骤。

## 1. 前置要求

- Node.js 22.12+（`node --version`）
- 一台可被访问者访问的云服务器（2C4G 即可支撑演示规模；房间容量默认 20）
- 一个域名（可选但推荐，用于 HTTPS）

## 2. 构建与启动

```bash
cd atom-jianghu
npm ci
npm run build        # 生成 dist/
npm start            # 等价于 node server/index.mjs
```

默认监听 `0.0.0.0:8080`。启动日志会显示世界地址、容量、数据目录与模型配置状态。

验证：

```bash
curl http://127.0.0.1:8080/api/content/health   # {"ok":true,...}
# 浏览器打开 http://<服务器IP>:8080
```

## 3. 环境变量

所有配置通过进程环境变量注入（可用 systemd EnvironmentFile、Docker `-e` 或云平台控制台）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | 监听地址；只本机测试可设 `HOST=127.0.0.1` |
| `ATOM_DATA_DIR` | `./data` | **账号、记忆、发布状态、审计、预算账本的存储目录**（持久化重点） |
| `ATOM_ADMIN_TOKEN` | `atom-local-demo` | 运营后台 `/admin.html` 的令牌，**上线前必须修改** |
| `ATOM_ROOM_CAPACITY` | `20` | 默认房间容量（满员后排队） |
| `ATOM_ROOMS` | 空 | 增加房间：`id:名称:容量,...`（如 `teahouse:江湖茶楼:5`）；每房独立世界 |
| `ATOM_RECLAIM_WINDOW_MS` | `15000` | 断线名额保留窗口 |
| `ATOM_ALLOWED_ORIGINS` | 空 | 额外允许的 WS 来源（逗号分隔）；同源始终放行 |
| `ATOM_LLM_BASE_URL` / `ATOM_LLM_API_KEY` / `ATOM_LLM_MODEL` | 空 | OpenAI 兼容模型；不配置则 AI 私聊使用本地资料演示（界面明确标注） |
| `ATOM_DAILY_BUDGET` / `ATOM_DAILY_CALL_LIMIT` / `ATOM_MAX_CONCURRENT` | `0` / `0` / `3` | 模型预算：金额达 80% 降级、100% 停止新调用；次数与并发上限 |
| `ATOM_PRICE_IN_PER_MTOK` / `ATOM_PRICE_OUT_PER_MTOK` | `0` | 每百万 token 单价（用于费用核算） |
| `ATOM_EMBEDDING_BASE_URL` / `ATOM_EMBEDDING_API_KEY` / `ATOM_EMBEDDING_MODEL` | 空 | 嵌入提供方（OpenAI 兼容）；配置后记忆与作品检索走向量余弦，未配置回退本地 TF-IDF；结果缓存在数据目录 |
| `ATOM_AUTH_MODE` | `local` | `external` 时成员用社区账号令牌登录（见下） |
| `ATOM_AUTH_JWKS_URL` / `ATOM_AUTH_ISSUER` / `ATOM_AUTH_AUDIENCE` | 空 | JWKS 模式：验证社区签发的 JWT（RS/ES） |
| `ATOM_AUTH_INTROSPECT_URL` / `ATOM_AUTH_CLIENT_ID` / `ATOM_AUTH_CLIENT_SECRET` | 空 | 内省模式（RFC 7662）：由社区账号服务校验令牌 |

安全底线：`ATOM_ADMIN_TOKEN` 与模型密钥不要提交到 Git；`data/` 已列入 `.gitignore`。

### 接入社区账号体系（生产鉴权）

1. 设 `ATOM_AUTH_MODE=external`，并按你们的签发方式二选一：JWKS（推荐，本地验签）或内省（问号式校验）。
2. 成员在前端"使用社区账号登录"粘贴社区系统签发的访问令牌；服务端验证通过后按 `subject` 稳定映射到本地账号（首次自动建档、同名自动区分），签发本地会话——世界、私聊、记忆全部按该身份生效。
3. 本地注册/登录在 external 模式下停用（演示与应急仍可在 local 模式运行）。
4. 验签与映射有自动化测试（mock JWKS：合法通过、篡改/错签发者/过期拒绝、映射稳定）。

## 4. HTTPS 与反向代理（推荐）

浏览器要求 HTTPS 页面上的 WebSocket 使用 `wss://`。用 Caddy 最简单：

```caddyfile
your.domain.com {
  reverse_proxy 127.0.0.1:8080
}
```

Caddy 自动签发并续期证书，WebSocket 升级自动透传。Nginx 参考：

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;   # WebSocket 必需
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
}
```

WS 来源校验已内置：只有同源（或 `ATOM_ALLOWED_ORIGINS` 白名单）才能升级，第三方页面无法劫持浏览器会话。

## 5. 进程守护（systemd 示例）

`/etc/systemd/system/atom-jianghu.service`：

```ini
[Unit]
Description=AtomHub Living World
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/atom-jianghu
EnvironmentFile=/opt/atom-jianghu/.env
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`.env` 里按上表配置（不要设置 `VITE_` 前缀的变量）。`systemctl enable --now atom-jianghu` 启动。

## 6. 数据、备份与回滚

- **数据目录**：`data/accounts.json`、`data/memories.json`、`data/publication-overrides.json`、`data/audit-log.json`、`data/usage-ledger.json`。升级前备份整个目录即可。
- **升级**：`git pull`（或替换代码）→ `npm ci` → `npm run build` → `systemctl restart`。数据不受影响。
- **回滚**：还原上一个代码版本 + 重新 build + 重启；数据目录保持（内容发布状态继续有效）。
- **健康检查**：`GET /api/content/health`（可用于负载均衡或监控探针）。

## 7. 上线前检查清单

- [ ] `ATOM_ADMIN_TOKEN` 已修改为强令牌
- [ ] `ATOM_DATA_DIR` 指向持久化磁盘（容器场景挂载卷）
- [ ] HTTPS 已配置（Caddy/Nginx），`wss://` 连通
- [ ] 模型密钥与预算已配置（或确认使用本地资料演示并在界面标注）
- [ ] 已用两个浏览器/两台设备验证：联机相见、私聊、AI 同游
- [ ] 如需公开演示，容量与排队行为已确认（满员进入队列而非报错）

## 8. 两种部署形态对照

| 形态 | 命令 | 能力 |
| --- | --- | --- |
| 完整联机服务 | `npm run build && npm start` | 全部功能：账号、联机世界、AI 私聊、运营后台 |
| 纯静态演示 | `VITE_BASE_PATH=/Atomic-Jianghu/ VITE_STATIC_DEMO=true npm run build`，托管 `dist/` | 作品浏览、本地演示小镇与 AI 聊天（无联机、无账号） |

## 9. 已知边界（演示版）

- 账号体系默认本地实现（scrypt + 会话文件）；已提供外部身份接入点（JWKS/内省 + subject 稳定映射），接入社区账号体系见上文。
- 单进程单房间；水平扩展需引入共享状态（后续阶段）。
- 私人对话原文不写日志；故障排查使用请求 ID 与元数据。

## 10. Vercel 部署：前端静态托管 + 世界服务端分离

### 10.1 为什么不能把整个应用部署到 Vercel

Vercel 是 serverless / 静态托管平台，与本项目的架构前提不兼容，直接导入仓库会失败或只能得到空壳：

| Vercel 的限制 | 对本项目的影响 |
| --- | --- |
| 没有长驻进程（函数按请求拉起、随时回收） | 权威世界的内存状态（角色位置、房间、AI 日程）无法常驻 |
| 不支持 WebSocket 升级（`/ws/world`） | 联机世界、位置同步、私聊全部不可用 |
| 函数内文件系统只读且易失 | 账号、发布状态、记忆、审计日志写在 `data/`，无法持久 |

因此仓库里没有（也不应有）把 `server/index.mjs` 当 Vercel 函数的配置。**正确的云部署形态是前后端分离**：前端（静态资源）放 Vercel，世界服务端（Node 长驻进程）放容器平台或云主机。

### 10.2 架构与数据流

```
浏览器 ──HTTPS──> Vercel（静态：index.html / assets / admin.html）
   │  │
   │  └──/api/* ──HTTPS──> 世界服务端（内容/鉴权/记忆/聊天 API）
   └────/ws/world ──WSS──> 世界服务端（权威世界广播）
```

客户端默认同源（单进程部署无需任何配置）；分离部署由构建期环境变量指定服务端地址：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `VITE_API_BASE` | 世界服务端的 HTTP 根，所有 `/api/*` 与 `/admin.html` 都走它 | `https://world.example.com` |
| `VITE_WS_URL` | 世界服务端的 WS 根 | `wss://world.example.com/ws/world` |

### 10.3 第一步：部署世界服务端（必须先做）

任选其一，关键是**长期运行 + 可写磁盘 + 支持 WebSocket**：

**A. Docker（任意容器平台 / 自己的云主机）**

```bash
# 构建并启动（数据落在命名卷 atom-data 里）
ATOM_ALLOWED_ORIGINS=https://your-app.vercel.app docker compose up -d --build
```

**B. 云主机直接跑**（详见本文第 2—7 节）

```bash
npm ci && npm run build && ATOM_ALLOWED_ORIGINS=https://your-app.vercel.app npm start
```

世界服务端**必须配 HTTPS/WSS**（浏览器不允许 https 页面连接 ws://）。三种常见做法：平台自带 TLS（Railway/Render/Fly.io 默认提供）、云主机 + Nginx 反代（第 4 节）、或套 CDN。

> `ATOM_ALLOWED_ORIGINS` 必须填前端域名（多个用逗号）——WS 升级会校验 Origin，同源才放行；不填则联机世界连不上。

### 10.4 第二步：Vercel 部署前端

仓库已含 `vercel.json`（构建 `npm run build`，输出 `dist/`，SPA 回退），在 Vercel 导入仓库后：

1. Framework Preset 选 **Vite**（或 Other，构建命令与输出目录已由 `vercel.json` 指定）；
2. 在项目 Settings → Environment Variables 添加：
   - `VITE_API_BASE` = `https://<世界服务端域名>`
   - `VITE_WS_URL` = `wss://<世界服务端域名>/ws/world`
3. Deploy。以后每次推送 main 分支自动重新部署。

漏配这两个变量时，站点仍能打开（作品浏览走内置快照降级），但进入联机世界会明确提示"未配置世界服务端"，不会静默失败。

### 10.5 联调与排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 能打开站点但进不了联机世界，提示未配置 | 环境变量未设或未重新部署 | 设置 `VITE_API_BASE`/`VITE_WS_URL` 后 Redeploy |
| WS 连接被拒（控制台 403/握手失败） | 世界服务端未登记前端域名 | 在服务端设 `ATOM_ALLOWED_ORIGINS=https://<vercel域名>` 并重启 |
| 浏览器报 Mixed Content | 前端是 https、服务端是 http/ws | 给世界服务端配 TLS，或改用自带 TLS 的平台 |
| 登录/发布/记忆不生效 | `/api/*` 打到了 Vercel 而非服务端 | 确认 `VITE_API_BASE` 指向世界服务端 |
| 运营后台 401 | 后台在服务端上，需服务端地址访问 | 直接访问 `https://<世界服务端域名>/admin.html` |

### 10.6 与同源部署的选择

- **同源单进程**（第 2—7 节，或 Docker）：最简单，一个域名搞定，适合演示与小规模社区；缺点是静态资源也由 Node 提供，无 CDN 加速。
- **Vercel + 世界服务端**：前端走 CDN、自动部署、全球加速；代价是多一个服务要维护，且服务端必须自带 TLS。社区规模上来后推荐这种形态。

## 11. Docker 云部署（推荐）

整个服务端（静态前端 + API + 权威世界 WebSocket）已容器化，一条命令在任何云服务器上跑起来。

### 11.1 快速开始

```bash
# 1) 准备配置
cp .env.example .env && vim .env      # 至少填 DOMAIN（有域名时）

# 2) 构建并启动（无域名：直接访问 http://<服务器IP>:8080）
docker compose up -d --build

# 2b) 有域名：启用 Caddy 自动 HTTPS（80/443 端口）
docker compose --profile tls up -d --build
```

启动后用 `docker compose logs -f world` 看日志，`docker compose ps` 看健康状态。

### 11.2 架构

```
                    ┌────────────────────────────┐
   80/443 (tls) ──> │ Caddy（自动证书 + WS 升级）  │ ──> world:8080
                    └────────────────────────────┘      （Node 单进程：静态 + API + WS）
   8080（无域名时直连）───────────────────────────────^

world 容器：非 root 运行、tini 信号转发、HEALTHCHECK 探活；
数据（账号/发布/记忆/审计/预算账本）在命名卷 atom-data，容器重建不丢。
```

### 11.3 镜像与运行要点

- 多阶段构建：构建阶段装全部依赖并打包前端；运行阶段只含生产依赖与 `dist/ server/ src/ public/`，镜像约 200MB 量级。
- 运行阶段已用「与 Dockerfile 完全一致的文件集 + 仅生产依赖」在容器外实测通过（两套 e2e：主流程 + 联机双浏览器）。
- 数据目录：容器内 `/app/data`（`ATOM_DATA_DIR`），务必挂卷；备份 = 停服后拷贝该卷（见第 6 节）。
- 分离部署（前端在 Vercel）时：world 容器照常运行，设 `ATOM_ALLOWED_ORIGINS=https://<前端域名>`，前端构建设 `VITE_API_BASE`/`VITE_WS_URL` 指向本服务（第 10 节）。
- 多架构：云服务器多为 amd64，本地 Apple Silicon 构建时加 `--platform linux/amd64`（或在目标机上直接构建）。

### 11.4 升级与回滚

```bash
git pull                 # 或等同步后的新提交
docker compose up -d --build   # 重建并替换容器（数据卷不动）
# 回滚：git checkout <上一个提交> 后再次 up -d --build
```

### 11.5 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 容器反复重启 | 端口被占或数据卷权限 | `docker compose logs world` 看具体错误；换 `ports` 端口 |
| 健康检查不通过 | 启动超过 15 秒或内容接口异常 | `docker exec atom-world node -e "fetch('http://127.0.0.1:8080/api/content/health').then(r=>console.log(r.status))"` |
| 证书签发失败 | 域名未解析到本机 / 80 被占 | 确认 DNS A 记录指向服务器，`docker compose --profile tls` 需要 80/443 |
| 改了 .env 不生效 | 环境变量在构建/启动时注入 | 修改后 `docker compose up -d --force-recreate` |
