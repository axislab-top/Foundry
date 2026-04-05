# 协作 WebSocket 契约（`/collaboration` 命名空间）

## 连接

- **鉴权**：握手 `auth.token` 或 `Authorization: Bearer`，且提供 `companyId`（`auth.companyId` 或 query）。
- **版本**：Redis 载荷含 `v: 1`（见 API `CollaborationRealtimePublisher`）。

## 客户端 → 服务端

| 事件 | 载荷 | 说明 |
|------|------|------|
| `join_room` | `{ roomId }` | 校验成员后加入 `collab:{companyId}:{roomId}` |
| `join_company_tasks` | — | 加入 `tasks:company:{companyId}`，接收任务进度与组织提示 |
| `send_message` | `{ roomId, content, messageType? }` | RPC 写库；若未启用 Redis 推送则网关直接广播 `message:new` |

## 服务端 → 客户端

| 事件 | 触发 | 房间 |
|------|------|------|
| `message:new` | 聊天消息、Redis `message:new` | 房间 |
| `message:chunk` | 流式块（预留） | 房间 |
| `approval:needed` | Redis | 房间 |
| `task:progress` | Redis `task:progress` | `tasks:company:{companyId}` |
| `task:progress`（房间级） | Redis `task:room_progress` | 房间 |
| `org:structure_changed` | 组织变更后 Redis `org:structure_changed` | `tasks:company:{companyId}` |

## 断线重连

- 客户端重连后应 **重新 `join_room` / `join_company_tasks`**。
- 历史消息补拉请使用 REST/RPC 分页查询（如 `collaboration.messages.list`），不由 WS 保证全量序。
