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
