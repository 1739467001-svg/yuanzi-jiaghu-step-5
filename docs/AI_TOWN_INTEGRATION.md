# AI Town 接入记录

核查时间：2026-09-07。
参考提交：8e05997f2409275669c8344b84a51692e83f3f33。

## 已读代码与接入点

| 上游文件 | 已有能力 | 原子江湖接入方式 |
| --- | --- | --- |
| src/components/Game.tsx | Pixi 舞台、世界订阅、角色详情 | 使用当前 Three.js 场景替换 Pixi 世界表现，保留 React 内容面板 |
| convex/world.ts | defaultWorldStatus、worldState、gameDescriptions、heartbeatWorld | 经权限审计后提供世界订阅与心跳；不复制未审计的公有接口 |
| convex/aiTown/player.ts | 位置、朝向、路径、活动、真人控制字段 | x/y 映射到场景 x/z；客户端插值，上游为权威位置 |
| convex/aiTown/movement.ts | 寻路与移动 | 地图可走格必须与新的建筑、河流、桥梁同步 |
| convex/aiTown/conversation.ts | 会话与参与者 | 保留一对一约束，增加用户邀请和服务端参与者校验 |
| convex/agent/memory.ts | 摘要、重要性、embedding、向量检索 | 加入 owner/world/agent 作用域、删除传播和过期策略 |
| convex/aiTown/insertInput.ts | 向引擎提交输入 | 使用经过身份验证的移动/会话命令 |

## 必须先解决的实际问题

本次读取的 `convex/world.ts` 中，`userStatus`、`joinWorld`、`leaveWorld` 与 `sendWorldInput` 的用户鉴权存在被注释掉的代码，真人身份使用 `DEFAULT_NAME`。不能直接复用为多账号社区。

接入步骤：

1. 在独立开发环境启动固定上游版本，建立真实身份与玩家 ID 映射，恢复服务端鉴权。
2. 定义公开位置订阅与私人消息查询。位置转换仅暴露公开角色字段；对话正文不随世界快照广播。
3. 按 `config.js` 导出地图可走网格，确保河流、桥和建筑在服务端阻挡一致。
4. 使用两个浏览器账号验收移动、邀请、聊天、拒绝、离开和断线恢复。
5. 将赛事、作品与用户收藏迁入持久数据库。AI 导览只索引审核发布的内容。
6. 引入用户授权的长期记忆与检索，检查来源、可见范围、TTL 与删除派生向量。
7. 接入持久预算、部署和监控，再扩大 AI 数量与并发。

`src/world/aiTownAdapter.js` 目前经过样例坐标测试，但未经过真实 Convex 服务联调。当前运行页面仍使用 `WorldEngine` 本地状态机。

上游代码使用 MIT 协议，完整许可证保存在 `THIRD_PARTY_NOTICES.md`。
