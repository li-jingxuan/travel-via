# History 功能实现总结

## 1. 本次实现范围

本次版本围绕“一个 `session_id` 对应一条 history”落地了以下能力：

- 使用 `PostgreSQL + Drizzle ORM` 管理业务历史数据
- 使用 `LangGraph PostgresSaver` 替换 `MemorySaver`
- 在 Graph state 中补充轻量 `conversationRecords`
- 自动记录对话历史与最终规划结果
- 提供 3 个历史接口：
  - `GET /history`
  - `GET /history/:sessionId`
  - `POST /history/delete`
- 新增 `/history` 列表页与 `/history/[sessionId]` 详情页
- 支持从历史记录继续聊天：`/?sid=<sessionId>`

## 2. 核心设计

### 2.1 双存储职责

历史功能拆成两层：

1. 业务历史表
   - `travel_history`
   - `travel_history_message`
   - 作用：给页面列表、详情、删除、未来导出使用

2. LangGraph checkpoint
   - `PostgresSaver`
   - 作用：给同一个 `session_id/thread_id` 续聊恢复上下文

### 2.2 session 与 thread 对齐

- `session_id` 是业务历史唯一标识
- `session_id` 同时作为 LangGraph 的 `thread_id`
- 删除历史时，同时删除该 thread 的 checkpoints，防止旧上下文被再次恢复

### 2.3 conversationRecords 策略

本次版本已补 `conversationRecords`，但只保留轻量最近窗口：

- 仅保留最近 `16` 条
- 只保存自然对话内容，不保存 SSE 进度节点
- 主要来源：
  - 每轮用户输入
  - 追问节点生成的 assistant clarification
- 完整全量历史仍以 `travel_history_message` 表为准

## 3. 数据库结构

### 3.1 `travel_history`

保存会话当前最新结果与列表摘要字段：

- `session_id`
- `status`
- `title`
- `destination`
- `travel_days`
- `travel_type`
- `latest_summary`
- `final_plan_json`
- `collected_intent_json`
- `clarification_json`
- `conversation_snapshot_json`
- `error_json`
- `created_at`
- `updated_at`
- `last_message_at`
- `deleted_at`

### 3.2 `travel_history_message`

保存完整消息流水：

- `history_id`
- `session_id`
- `seq`
- `role`
- `kind`
- `content`
- `meta_json`
- `created_at`
- `deleted_at`

## 4. 独立数据库配置

数据库配置被独立收敛到 `packages/db`：

- [config.ts](/Volumes/D/projects/travel-via/packages/db/src/config.ts)
- [client.ts](/Volumes/D/projects/travel-via/packages/db/src/client.ts)
- [checkpointer.ts](/Volumes/D/projects/travel-via/packages/db/src/checkpointer.ts)
- [drizzle.config.ts](/Volumes/D/projects/travel-via/packages/db/drizzle.config.ts)

当前支持的环境变量：

- `DATABASE_URL`
- `DATABASE_POOL_MAX`（可选，默认 10）

## 5. 主要改动文件

### 5.1 新增数据库包

- [packages/db/package.json](/Volumes/D/projects/travel-via/packages/db/package.json)
- [packages/db/src/index.ts](/Volumes/D/projects/travel-via/packages/db/src/index.ts)
- [packages/db/src/schema/history.ts](/Volumes/D/projects/travel-via/packages/db/src/schema/history.ts)
- [packages/db/src/history-repository.ts](/Volumes/D/projects/travel-via/packages/db/src/history-repository.ts)

### 5.2 Agent 持久化与语境记忆

- [packages/agents/src/graph/index.ts](/Volumes/D/projects/travel-via/packages/agents/src/graph/index.ts)
- [packages/agents/src/graph/state.ts](/Volumes/D/projects/travel-via/packages/agents/src/graph/state.ts)
- [packages/agents/src/nodes/intent-node.ts](/Volumes/D/projects/travel-via/packages/agents/src/nodes/intent-node.ts)
- [packages/agents/src/nodes/system/ask-clarification-node.ts](/Volumes/D/projects/travel-via/packages/agents/src/nodes/system/ask-clarification-node.ts)

### 5.3 API 层

- [apps/apis/src/service/agentService.ts](/Volumes/D/projects/travel-via/apps/apis/src/service/agentService.ts)
- [apps/apis/src/service/historyService.ts](/Volumes/D/projects/travel-via/apps/apis/src/service/historyService.ts)
- [apps/apis/src/controller/historyController.ts](/Volumes/D/projects/travel-via/apps/apis/src/controller/historyController.ts)
- [apps/apis/src/router/historyRouter.ts](/Volumes/D/projects/travel-via/apps/apis/src/router/historyRouter.ts)

### 5.4 Web 历史页与回填

- [apps/web/lib/history.ts](/Volumes/D/projects/travel-via/apps/web/lib/history.ts)
- [apps/web/hooks/useChatStream.ts](/Volumes/D/projects/travel-via/apps/web/hooks/useChatStream.ts)
- [apps/web/app/history/page.tsx](/Volumes/D/projects/travel-via/apps/web/app/history/page.tsx)
- [apps/web/app/history/[sessionId]/page.tsx](/Volumes/D/projects/travel-via/apps/web/app/history/[sessionId]/page.tsx)
- [apps/web/app/HomePageClient.tsx](/Volumes/D/projects/travel-via/apps/web/app/HomePageClient.tsx)
- [apps/web/app/page.tsx](/Volumes/D/projects/travel-via/apps/web/app/page.tsx)

## 6. 当前行为说明

### 6.1 自动落历史

只要走对话链路，后端就会自动维护历史：

- 首次会话自动创建 `travel_history`
- 自动写入欢迎语
- 自动记录用户输入
- 追问时自动记录 assistant clarification
- 生成总结时自动记录 assistant summary
- 最终把 `finalPlan`、`intent`、`snapshot` 等回写到主表

### 6.2 删除行为

`POST /history/delete` 会同时做三件事：

1. 软删 `travel_history`
2. 软删 `travel_history_message`
3. 删除 LangGraph 对应 `thread_id` 的 checkpoints

### 6.3 继续聊天

通过 `/?sid=<sessionId>` 进入首页时：

1. 前端先调 `GET /history/:sessionId`
2. 回填旧消息与旧规划结果
3. 下一条消息继续使用同一个 `session_id`
4. Graph 从 PostgresSaver 恢复上下文继续执行

## 7. 本次未做项

- 未实现 save / unsave 接口
- 未实现导出接口
- 未实现多版本 plan 历史
- 未实现 conversationRecords 历史摘要压缩
- 未实现用户体系与多用户隔离

## 8. 验证结果

本次已完成验证：

- `pnpm install`
- `pnpm check-types`
- `pnpm -C packages/agents typecheck`
- `pnpm -C packages/agents build`
- `pnpm -C apps/apis build`
- `pnpm build`

前端构建中已额外修复：

- Next 16 下 `useSearchParams()` 需要 `Suspense` 边界的问题
- client 侧工作区包导入改为明确子路径，避免 Turbopack 解析根导出不稳定
