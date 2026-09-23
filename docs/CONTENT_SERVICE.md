# 展馆内容服务

参赛赛事、赛道与作品数据由 `src/content/catalog.js` 统一规范化：校验稳定 ID、剥离私人联系字段，并按 `publicationStatus` 过滤，只向公开读取返回 `已发布` 内容。3D 展厅、阅读目录、演示导览和服务端接口读取同一份契约，撤回与草稿不会进入任何公开入口。

开发和 preview 服务都支持这些接口：

- `GET /api/content/health`：已发布赛事和作品数量、内容快照 ID。
- `GET /api/content/catalog`：完整已发布目录（前端统一入口），附共享展陈的 `exhibitionId`、`layoutVersion`、展区数与入选作品 ID。
- `GET /api/exhibitions`：赛事目录摘要（兼容旧命名，实际承载赛事目录，不是 Exhibition 展陈对象）。
- `GET /api/exhibitions/{editionId}`：一届赛事详情，含 `eventStage`、`publicationStatus`、`contentVersion`。
- `GET /api/works?edition=&track=&q=`：按赛事、赛道和关键词查询作品；生产版增加分页与稳定排序。
- `GET /api/works/{workId}`：作品详情。

错误使用 `code` 区分：`not_found`（未找到，草稿与待审核同样不暴露存在）、`withdrawn`（已撤回，410）、`method_not_allowed`（405）。公开响应只含已发布字段。

## 数据契约

`src/data/editions.json` 中每届赛事与作品都带 `publicationStatus`（草稿、待审核、已发布、已撤回）、`contentVersion` 和赛事级 `eventStage`（预告、报名、进行中、评审中、已结束、未知）。规范化在导入时和读取时都会执行，损坏的契约会直接报错而不是静默降级。

## 共享展陈

`src/content/exhibition.js` 定义每个房间固定的共享展陈：`exhibitionId`、`layoutVersion`、单区展位数（8—12）与入选作品。3D 展厅展示展区 1；个人切换赛事、赛道与关键词只改变阅读面板，不再替换 3D 展品。阅读面板中的"展陈中"标记与展区编号都来自这一份定义。

首个共享展览按 PRD 待确认清单的默认方案：优先 FunSkills 已发布作品，共 38 条记录、5 个展区。正式共享展览由运营在后台指定。

## 前端访问层

`src/content/useCatalog.js` 决定读取策略：静态演示（`VITE_STATIC_DEMO=true`）直接使用内置快照；联机开发优先请求 `/api/content/catalog`；接口失败时降级到同一份内置快照，并在界面提示"已切换本地内容快照"，作品阅读不中断。服务端返回的展陈 `layoutVersion` 与本地不一致时给出明确提示。

当前仍是本地静态数据 + 只读接口，不是云端审核系统。素材收集、授权确认和正式名单核验由运营负责，不计入导入脚本。
