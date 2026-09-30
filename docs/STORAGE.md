# 数据存储方案报备与选型建议

> 结论先行：现在是**纯 JSON 文件存储**（没有数据库服务）。按当前访问量，我的推荐是
> **先迁到 SQLite（单文件、零运维、事务安全）**；等你要跑多台世界服务端、或日活到几万级别，
> 再升级到 **PostgreSQL**。MySQL 我不推荐用于这个世界服务端——原因见第 4 节。

## 1. 现状报备（代码里实际在用的）

所有运行期状态都写在 `data/` 目录下的 JSON 文件里，写入用的是"临时文件 + 重命名"的原子替换（`writeJsonAtomic`）：

| 文件 | 内容 | 当前量级 |
| --- | --- | --- |
| `accounts.json` | 账号（昵称、衣带色、scrypt 密码哈希与盐）与全部会话令牌 | 402 个账号 / 402 个会话 / 约 220KB |
| `memories.json` | 私人兴趣记忆（按账号 + 角色隔离） | 27KB |
| `follows.json` | 关注关系（真人 / AI 分开存） | 3KB |
| `publication-overrides.json` | 赛事发布状态、撤回记录、后台导入的赛事 | 17KB |
| `audit-log.json` | 运营后台的不可删除审计流水 | 122KB |
| `sects.json` | 门派（未接门派网站时的本地库） | 内置 8 个演示门派 |
| `sects-overlay.json` / `sects-cache.json` | 接门派网站后的本地改动与同步缓存 | 按改动大小 |
| `embedding-cache.json` | 向量召回缓存（配置了嵌入模型才有） | 按使用量 |
| `usage-ledger.json` | 模型调用账本（ budget 核算） | 按调用量 |

内容基线（38 条作品、2 个赛事）不走数据库：`src/data/editions.json` 跟着代码走，运营改动落在 `publication-overrides.json`，两条叠加成公开目录。

**这套方案现在的真实问题**（按严重程度）：

1. **没有事务，读-改-写有竞态**：每次写都是"整文件读出来 → 改 → 整文件写回"。两个请求同时注册/加记忆，后写的会把前一个的改动吃掉。现在是单进程单线程还能扛，接入真实流量后这就是数据丢失。
2. **会话只增不除**：`login()` 顺手清理过期会话，但登出是精确删除，泄漏的会话（从不登出的浏览器）会一直躺在文件里，直到某次别人登录时才被扫掉——文件只涨不跌。
3. **全量重写**：登录一次就重写整个 `accounts.json`。账号到几千、审计流水到几万条时，每次写几 MB，延迟和 IO 都难看。
4. **查询是线性扫描**：`Object.values(store.users).find(u=>u.name===display)`——登录要遍历全部账号；记忆、关注同理。数据量小时无所谓，量大就是每次请求都全表扫。
5. **只能单机**：文件在多台服务端之间没法安全共享，联机世界想横向扩就必须换存储。

## 2. 方案对比

| 方案 | 运维成本 | 并发安全 | 查询能力 | 适合阶段 |
| --- | --- | --- | --- | --- |
| 现状 JSON 文件 | 零 | 无（读-改-写竞态） | 线性扫描 | 本地演示 / 单机小规模 |
| **SQLite**（推荐先做） | 零（一个文件，跟着 `data/` 走） | 有（WAL + 事务） | 索引、SQL | 单机到中等规模（几万账号、几十万记忆） |
| MySQL | 要一台常驻服务 + 备份/监控/账号权限 | 有 | 索引、SQL | 你们已经有 MySQL 且愿意共用 |
| PostgreSQL | 要一台常驻服务 | 有（最好） | 索引、SQL、JSONB | 多机部署 / 大规模 |

## 3. 推荐：SQLite（`better-sqlite3`）

**为什么是它**：这个世界服务端本来就是"单进程 + WebSocket 房间"的形态，SQLite 和它是同一量级的搭档——不需要额外进程、不需要连接池、不需要 DBA；`data/atom.db` 一个文件，备份就是拷贝（配合 SQLite 自带的 WAL，读不阻塞写）。它把上面 5 个问题一次解决：事务消灭竞态、索引让登录和记忆查询变成 O(log n)、会话按过期时间清理、写入只动涉及的页、` better-sqlite3` 是同步 API，和现在 `verify()`/`login()` 的调用形状几乎一样，改动集中在存储层。

**表设计（与现有函数一一对应）**：

```sql
users(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, color TEXT, salt TEXT, pass_hash TEXT, external_id TEXT UNIQUE, created_at TEXT);
sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER, expires_at INTEGER);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);          -- 过期清理
memories(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, agent_id TEXT NOT NULL, text TEXT, source TEXT, created_at INTEGER);
CREATE INDEX idx_memories_scope ON memories(account_id, agent_id);  -- 召回先限定作用域
follows(kind TEXT, target_id TEXT, account_id TEXT, PRIMARY KEY(kind, target_id, account_id));
sects(...);        -- 与 server/sects.mjs 的对象同字段
audit_log(...);    -- 只 INSERT，不 UPDATE
```

**迁移路径（不影响现在跑着的东西）**：

1. `server/store-sqlite.mjs` 实现与 `accounts.mjs` / `memories.mjs` / `follows.mjs` 相同的导出函数（`register/login/verify/updateProfile/...`），内部换成 SQL。上层 `index.mjs`、`sects-api.mjs`、`world.mjs` 一行不用改——它们只依赖这些函数签名。
2. 一次性导入脚本 `scripts/migrate-json-to-sqlite.mjs`：把 `data/*.json` 现有内容灌进库（幂等，可重跑）。
3. 用环境变量切换：`ATOM_STORE=sqlite`（默认仍是 json，方便回退）。切过去跑一遍全部 e2e 与 soak，确认无回归后再把默认改掉。
4. `docs/SECTS.md` 里记的那条不变：门派数据以原子公社网站为权威时，SQLite 只是本地缓存与覆盖层。

**什么时候该继续升级到 PostgreSQL**：要跑第二台世界服务端（多房间分房到多机）、或者日活/记忆量让单机 IO 成为瓶颈（经验值：账号 > 10 万、记忆 > 500 万条）。那时 SQLite 换 PG 的改动仍然只在存储层，`world.mjs` 的权威逻辑不用动。

## 4. 关于 MySQL

你熟悉 MySQL，如果**社区这边本来就有一台 MySQL 在跑**，最合理的选择不是给世界服务端单开一个库，而是：

- **账号体系统一走社区现有账号**：`ATOM_AUTH_MODE=external` + JWKS/内省验证这个接入点已经做好了（见 `docs/DEPLOY.md`），世界服务端不存密码、不存第二份账号表，只维护 `external_id → 本地角色` 的映射。社区站登录态直接进联机世界，也省掉"两套账号"的管理成本。
- 只有当你希望世界服务端**自包含**（不依赖社区站可用性）时，才值得给它单开一个 MySQL 库——那我更建议用同机的 SQLite，少一个要备份要监控的组件。

一句话：MySQL 适合做社区主站的关系库，不适合当这个世界服务端的内嵌存储；自包含场景选 SQLite，多机场景选 PostgreSQL，账号统一场景走已有的外部身份接入。

## 5. 现在就要做的两件事（不换库也能改善）

1. **会话改成懒清理**：`verify()` 命中过期会话时直接删掉该行，别只返回 null；登录时的全量扫描改成按过期时间删（SQLite 上有索引就是一条 DELETE）。
2. **audit-log 与 usage-ledger 做轮转**：按日期分文件（`audit-log-2026-09.json`），避免单文件无限增长——这也是迁 SQLite 之前的临时缓解。
