# GitHub 同步工作流

仓库：https://github.com/1739467001-svg/yuanzi-jiaghu-step-5 （默认分支 `main`）。

本项目的**每一次更新都会同步到这个仓库**。本文说明同步方式与使用方法。

## 为什么用脚本而不是 git push

本机到 `github.com:443` 的 git 协议连接持续被网络干扰（DNS 分配的 IP 无法连接、备用 IP 时通时断），而 `api.github.com` 一直稳定。因此同步通过 GitHub Git Data API 完成，由 `scripts/git-sync.mjs` 封装：

1. 本地 `git add -A && git commit`（保留本地历史，便于回看与恢复）；
2. 读取索引得到全部文件的 blob SHA，与远端当前树比对，**只上传缺失或变化的 blob**（并发 3，遇次级限流自动指数退避重试；已传 SHA 缓存在 `.git/api-blob-cache.json`，重复同步几乎零上传）；
3. 全量建树 → 建提交（父提交为远端当前提交，历史线性）→ 创建或更新 `refs/heads/main`。

## 每次更新后如何同步

在项目根目录执行：

```bash
node scripts/git-sync.mjs "本次更新的提交信息"
```

- 不传信息则自动生成 `chore: 同步更新 <时间>`。
- 依赖 GitHub 令牌：默认取 `gh auth token`（gh 已登录时无需配置），也可用环境变量 `GH_TOKEN=<token>` 覆盖。
- 脚本是幂等的：内容没有变化时不会创建新提交。
- 需要指定其他仓库/分支时用 `GH_REPO=owner/repo GH_BRANCH=branch` 覆盖。

## 网络恢复后的常规推送

如果某天 `github.com` 直连恢复正常，也可以直接用标准 git（本地提交历史与远端快照提交内容一致，首次可能需要 `--force` 对齐）：

```bash
git config http.version HTTP/1.1   # 规避本机环境的 HTTP/2 帧错误
git push origin main
```

## 云服务器部署

仓库里的代码即可直接部署：

```bash
npm ci && npm run build && npm start
```

环境变量、HTTPS 反向代理、数据备份与回滚见 [DEPLOY.md](DEPLOY.md)。`data/`、`dist/`、`node_modules/`、`artifacts/` 均已被 `.gitignore` 排除——部署机上是干净的全新状态，运行时数据由服务自行创建。
