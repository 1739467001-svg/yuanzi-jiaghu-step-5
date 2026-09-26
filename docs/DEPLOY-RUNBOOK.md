# 原子江湖 · 部署执行手册（照做即可）

> 目标形态：**Vercel（静态前端，CDN + 自动 HTTPS）+ 世界服务端（Docker/云主机，权威世界与 WebSocket）**。
> 本手册每一步都可直接执行；所有命令已在本地等价验证过（见文末「验证记录」）。
> 详细原理与排障见 [DEPLOY.md](DEPLOY.md) 第 10—12 节。

---

## 第 0 步：本地自检（部署前必做，1 分钟）

```bash
npm ci
npm run verify:repo     # 仓库完整性：构建所需文件都已入库
npm test                # 92 项单测
npm run build           # 前端构建
```

三项全绿再往下。任何一项红，先修再部署。

---

## 第 1 步：部署世界服务端（必须先做，Vercel 只是静态页面）

### 方式 A：Docker（推荐，任何有 Docker 的云服务器）

```bash
# 1. 克隆仓库
git clone https://github.com/1739467001-svg/yuanzi-jiaghu-step-5.git
cd yuanzi-jiaghu-step-5

# 2. 配置（按需修改）
cp .env.example .env
vim .env                # 至少确认 ATOM_ADMIN_TOKEN 改了、填 ATOM_ALLOWED_ORIGINS

# 3. 一键启动（无域名时：http://<服务器IP>:8080）
docker compose up -d --build

# 3b. 有域名时：自动 HTTPS（80/443）
DOMAIN=world.yourdomain.com ATOM_ALLOWED_ORIGINS=https://your-app.vercel.app \
  docker compose --profile tls up -d --build
```

### 方式 B：云主机直接跑（无 Docker）

```bash
git clone https://github.com/1739467001-svg/yuanzi-jiaghu-step-5.git
cd yuanzi-jiaghu-step-5
npm ci && npm run build
ATOM_ALLOWED_ORIGINS=https://your-app.vercel.app npm start
# 默认 0.0.0.0:8080；HTTPS 用 Nginx 反代（DEPLOY.md 第 4 节）
```

### 服务端关键配置（.env）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ATOM_ALLOWED_ORIGINS` | **是** | 前端域名（Vercel 分配的那个），多个用逗号。不填则联机连不上 |
| `ATOM_ADMIN_TOKEN` | **是** | 运营后台令牌，别用默认值 |
| `ATOM_DATA_DIR` | Docker 已配 | 数据落卷，容器重建不丢 |
| `ATOM_ROOMS` / `ATOM_ROOM_CAPACITY` | 否 | 多房间分流 / 单房容量（默认 20） |
| `ATOM_AUTH_MODE` | 否 | `local`（默认）或 `external`（接社区账号，需 JWKS/内省配置） |
| `ATOM_LLM_*` | 否 | 配置后 AI 私聊走真实模型，否则本地资料演示 |

**验收**：`curl http://<服务端>/api/content/health` 返回 `{"ok":true,...}`；浏览器打开 `http://<服务端>/` 能进联机世界。

---

## 第 2 步：部署前端到 Vercel

1. 登录 [vercel.com](https://vercel.com) → **Add New → Project → Import** `1739467001-svg/yuanzi-jiaghu-step-5`
2. 配置（`vercel.json` 已内置，一般无需修改）：

   | 设置项 | 值 |
   | --- | --- |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm ci` |
   | **Node.js Version** | **22.x**（Settings → General；低于 22.12 构建会失败） |

3. **Environment Variables**（Settings → Environment Variables，Production 环境）：

   ```
   VITE_API_BASE = https://world.yourdomain.com
   VITE_WS_URL   = wss://world.yourdomain.com/ws/world
   ```

   > 没有域名时先用 `http://<服务端IP>:8080` 与 `ws://<服务端IP>:8080/ws/world` 打通流程；注意 https 页面不能连 ws://，正式环境必须给服务端配 TLS。
   > `VITE_` 变量构建期内联，**改完必须 Redeploy**。

4. **Deploy**。完成后 Vercel 会分配域名（如 `xxx.vercel.app`）。

5. **把 Vercel 域名回填到服务端**：服务端 `.env` 的 `ATOM_ALLOWED_ORIGINS=https://xxx.vercel.app`，重启服务端。

---

## 第 3 步：联调验收清单

在 Vercel 域名上逐项确认：

- [ ] 首页打开，小镇 3D 场景正常，能点击地面行走
- [ ] 「联机世界」可进入，状态显示"联机世界"（不是"未配置世界服务端"提示）
- [ ] 注册账号 → 进入后能看到 8 位 AI 侠客活动
- [ ] 茶楼：走到茶楼 → 面板选空位入座 → 同桌区可见 → 一键邀请私聊
- [ ] 顶部「武林大会」进展示馆，作品列表/搜索/详情正常
- [ ] 运营后台：`https://<服务端域名>/admin.html`（注意是**服务端**域名，不是 Vercel），令牌登录后可发布/撤回/导入
- [ ] 手机浏览器打开，底部抽屉可展开，主要动线可用

任一环节失败，对照 [DEPLOY.md](DEPLOY.md) 第 10.5 节排障表。

---

## 第 4 步：日常更新（以后每次改代码）

```bash
# 本地改完 → 自检 → 同步 GitHub（Vercel 自动重新部署前端）
npm run verify:repo && npm test
node scripts/git-sync.mjs "本次更新说明"
```

- 只改前端：推送即自动部署（Vercel 监听 main）。
- 改了服务端：世界服务端要 `git pull && docker compose up -d --build`（或 `npm run build && npm start` 重启）。
- 改了 `VITE_` 变量：在 Vercel 里改完后 **Redeploy**。

---

## 验证记录（本手册依赖的全部实测）

| 项 | 结果 |
| --- | --- |
| 净检出构建（`git clone` → `npm ci` → `npm run build`） | 通过，`dist/` 产物齐全 |
| 静态产物独立运行（python http.server 起 dist/） | 通过，页面与内置快照降级正常 |
| 生产服务端 `server/index.mjs` 最新代码 + 两套 e2e（联机/主流程） | 通过 |
| CORS 策略（未授权来源无响应头 / 授权来源放行 / 预检 204） | 通过 |
| 分离部署拓扑（前端带 `VITE_API_BASE`/`VITE_WS_URL` + 世界服务端）跑联机验收 | 通过 |
| `npm run verify:repo` | 通过（构建范围 226 个文件全部入库） |

> 本机无 Docker 运行时，镜像未实际构建；Dockerfile 的文件集已用"容器外等价验证"（按运行阶段文件集 + 仅生产依赖实跑）覆盖，首次在服务器上构建时请关注 `docker compose logs world`。
