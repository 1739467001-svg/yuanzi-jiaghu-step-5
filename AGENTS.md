# AGENTS.md — 原子江湖开发守则

本文件是给后续所有开发会话（人或 AI）的硬性约定，优先级高于个人习惯。

## 1. 每次更新必须同步到 GitHub（硬性要求）

仓库：https://github.com/1739467001-svg/yuanzi-jiaghu-step-5.git （默认分支 `main`）

**每一次改动项目内容后，必须立即同步，不得遗漏。** 在 `atom-jianghu/` 目录执行：

```bash
node scripts/git-sync.mjs "本次更新的提交信息"
```

- 提交信息写清楚本次做了什么（阶段号 + 要点，一句话概括 + 关键数据）。
- 同步成功（输出"已同步到 GitHub"）后，才可以向用户汇报完成。
- 本机到 github.com:443 的 git 协议连接被网络干扰，因此同步走 Git Data API（脚本内部完成：本地 `git add -A && git commit` → 增量上传变更 blob → 全量建树 → 建提交 → 更新远端 ref）。不要尝试用普通 `git push`（会因连接失败或非快进而失败）；确需直连时先 `git config http.version HTTP/1.1`。
- 网络恢复后如想改用标准 git 推送，需先 `git fetch` 对齐（远端为 API 快照提交，与本地提交 SHA 不同但树一致）。
- 机制、故障处理与云部署步骤见 `docs/GITHUB.md` 与 `docs/DEPLOY.md`。

## 2. 完成定义（改动算"完成"的门槛）

0. `npm run verify:repo` 通过（仓库完整性：构建所需文件都已入库——Vercel/Docker 是干净检出，漏文件只在部署时爆炸）。
1. `npm test` 全绿（单测）。
2. 六套 e2e 全绿：`test:e2e`、`test:e2e-mp`、`test:e2e-model`、`test:e2e-queue`、`test:e2e-rooms`、`test:e2e-glb`（需先 `npm run build` 并起 preview 服务；`test:e2e-glb` 要带 `TEST_BASE_URL`）。
3. `npm run validate:world` 与 `npm run validate:content` 通过。
4. 文档同步更新：`docs/NEXT_TASK_PLAN.md`（阶段计划 → 进展）、`README.md`、`原子江湖2-交付说明.md`（在仓库上一级目录）、必要时 `docs/VERIFICATION.md`。
5. **最后执行第 1 节的 GitHub 同步。**

## 3. 其他约定

- 布局唯一来源是 `src/world/config.js`（建筑/角色/座位/主题），改布局必须跑 `validate:world`。
- 服务端权威逻辑在 `server/`，客户端预测在 `src/world/`；联机协议变更要同时改 `server/world.mjs` 与 `src/net/onlineClient.js` 并补单测（`tests/world-server.test.mjs`）。
- `data/`、`dist/`、`node_modules/`、`artifacts/`、`references/` 不入库（`.gitignore` 已含），部署机上是干净的全新状态。
- 压测：`npm run soak`（5 分钟）/ `soak:long`（2 小时）/ `soak:72h`（72 小时口径，专用机器）；跑 soak 前确认端口 5195 无残留进程。
- 每个阶段遵循"先有可运行结果和验收条件，再进入下一步"（见 `docs/NEXT_TASK_PLAN.md` 的阶段 1—6 路线）。
