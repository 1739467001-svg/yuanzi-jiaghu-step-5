# 3D 平台上线官网：部署方案

> 2026-10-17。目标：把原子江湖（官网的 3D 线上互动平台）部署到 atomclub.cn 体系下，
> 让官网用户点一下就走进这座小镇。配套：[THREE_D_INTEGRATION.md](THREE_D_INTEGRATION.md)（对接地图）、[DEPLOY.md](DEPLOY.md)（部署手册）、[OFFICIAL-SITE.md](OFFICIAL-SITE.md)（官网调研）。

---

## 0. 结论先行

**推荐独立子域**（如 `jianghu.atomclub.cn`）：世界服务端（Node + WebSocket）整站 Docker 部署，官网侧只需要一条 DNS、一条反代规则和一个入口链接。联机、WebSocket、API 全部同源零配置，与官网改版完全解耦。

**官网子路径**（`atomclub.cn/jianghu/`）也可行且已实测验证（base path 构建 + 浏览器启动通过），适合“必须同域”的场景（比如后续 cookie 级身份打通），但 API/WS 路径要单独规划。

---

## 1. 三种形态对比

| 形态 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| **A. 独立子域（推荐）** | `jianghu.atomclub.cn` → 世界服务端 | 联机/WS/API 全同源零配置；官网改版不影响；数据与故障域独立 | 需要 DNS + 证书；入口要从官网链出去（一步跳转） |
| B. 官网子路径 | `atomclub.cn/jianghu/` → 反代到世界服务端 | 同域无跨域；入口自然（导航里一项） | API/WS 要单独寻址（见 3.2）；官网 nginx 要加 WS 升级与 SPA 回退规则 |
| C. 官网内嵌 | 官网页面 iframe 嵌入 | 无缝体验 | iframe 高度/滚动/移动端适配麻烦；调试与分享体验差 |

---

## 2. 形态 A（独立子域）落地清单

**服务器侧**（一台云主机即可，Docker 一键）：

```bash
cp .env.example .env
# .env 里至少填：
#   DOMAIN=jianghu.atomclub.cn          # 有域名才配，配了加 --profile tls 自动 HTTPS
#   ATOM_OFFICIAL_SITE=https://atomclub.cn   # 门派/热帖/商店/任务全接官网真实数据
docker compose up -d --build           # 有域名：docker compose --profile tls up -d --build
```

构建期变量（前端指向官网，用于引流 CTA 与门派大厅回跳）：

```bash
VITE_SITE_URL=https://atomclub.cn VITE_SECT_HALL_URL=https://atomclub.cn/sects npm run build
```

**官网侧**（找官网运维做三件事）：

1. DNS：`jianghu.atomclub.cn` A 记录指向服务器 IP；
2. 入口：官网导航/横幅/关于页加一个链接「走进 3D 江湖 → https://jianghu.atomclub.cn」；
3. 分享：门派/活动的分享链接直接用 `https://jianghu.atomclub.cn/?sect=<id>` 深链（未登录访客也能直达门派内景）。

**本形态不需要** `ATOM_ALLOWED_ORIGINS`（同源）；只有官网要跨域调我们的 API 时才需要把它加进白名单。

---

## 3. 形态 B（官网子路径）落地清单

### 3.1 前端构建（已验证）

```bash
VITE_BASE_PATH=/jianghu/ npm run build
```

实测：所有资产（JS/CSS/品牌图/作品海报/favicon）都落在 `/jianghu/` 下，浏览器直接启动正常（场景、Logo、零报错）。favicon 已用相对路径，根路径与子路径两种部署都对。

### 3.2 API 与 WebSocket 的寻址（关键）

子路径部署下，前端在 `atomclub.cn/jianghu/`，但**世界服务端是独立进程**。API 默认走同源根路径（`/api/*`），会打到官网的 nginx 而不是我们的服务端——必须显式指向：

```bash
# 前端构建期
VITE_API_BASE=https://jianghu-api.atomclub.cn      # 世界服务端 HTTP 根（或官网反代出来的专用路径）
VITE_WS_URL=wss://jianghu-api.atomclub.cn/ws/world # WS 根
# 服务端
ATOM_ALLOWED_ORIGINS=https://atomclub.cn           # 只放行官网域名（防 WS 跨站劫持）
```

### 3.3 官网 nginx 规则（给官网运维的样例）

```nginx
# 3D 平台静态资源（或直接反代到世界服务端）
location /jianghu/ {
    alias /opt/atom-jianghu/dist/;      # 或 proxy_pass http://127.0.0.1:8080/jianghu/;
    try_files $uri $uri/ /jianghu/index.html;   # SPA 回退
}
location /jianghu/assets/ {
    alias /opt/atom-jianghu/dist/assets/;
    expires 1y; add_header Cache-Control "public, immutable";
}
```

注意：`/api/*` 与 `/ws/world` **不要**进 `/jianghu/` 规则——它们属于世界服务端（按 3.2 的地址单独反代）。

---

## 4. 与官网的内容对接配置（两种形态通用）

| 变量 | 值 | 作用 |
| --- | --- | --- |
| `ATOM_OFFICIAL_SITE` | `https://atomclub.cn` | 门派/热帖/资讯/商店/任务全部接官网真实数据（TTL 快照，失败沿用） |
| `VITE_SITE_URL` | `https://atomclub.cn` | 欢迎卡「加入原子公社」与关于页官网入口 |
| `VITE_SECT_HALL_URL` | `https://atomclub.cn/sects` | 门派内景「返回门派大厅 / 官网」 |
| `ATOM_LLM_BASE_URL` | `https://atengin.atomclub.cn/v1` | AI 私聊接原子引擎真实模型（另需 Key，见 DEPLOY.md 5.5 节） |

---

## 5. 身份打通后的升级（等官方 JWT/OIDC）

- **形态 B/C（同域）**：官网登录态 cookie 可直接共享，3D 平台的 `ATOM_AUTH_MODE=external` 校验官网令牌即可，最简单；
- **形态 A（跨子域）**：需要官网配合一次性 code 或受信跳转传令牌（`jianghu.atomclub.cn/?token=...` → 换本地会话），接入点已就绪（`server/external-auth.mjs`），只差签发方式。

在官方确认前，3D 平台的账号体系（本地名帖）独立运行，官网入口只做“引流”，不做“带入登录态”。

---

## 6. 上线前检查清单

- [ ] `npm run verify:repo` 通过（干净检出能构建——Vercel/Docker 都是干净检出）
- [ ] 形态 B：`VITE_BASE_PATH` 构建 + 浏览器启动验证（已实测通过）
- [ ] `ATOM_ADMIN_TOKEN` 改为强令牌（多运营用 `ATOM_ADMIN_TOKENS`）
- [ ] `ATOM_DATA_DIR` 持久化（Docker 命名卷 `atom-data`，容器重建不丢）
- [ ] WS 跨站防护：`ATOM_ALLOWED_ORIGINS` 只放官网域名（形态 B/C 必须）
- [ ] 官网入口链接 + `?sect=` 分享深链实测
- [ ] 移动端 5 档体检（`npm run audit:mobile`）
- [ ] 官网真实数据四件套（门派/活动/热帖/商店）在部署环境实测可见
