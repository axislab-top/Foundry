# Session Memory Rollout / Rollback

## Feature Flags
- `ENABLE_SESSION_MEMORY`（API）: 开启后群聊索引写入 `session:<roomId>`；关闭时回退写入 `company/dept`。
- `ENABLE_MEMORY_CONSOLIDATION`（API/Worker）: 开启会话 consolidation 触发与消费。
- `ENABLE_AUTONOMOUS_MEMORY_ADAPTER`（Worker）: 开启 Autonomous 走 `MemoryPort`（`memory.search.hierarchy` / `memory.entries.store`）。
- `AUTONOMOUS_MEMORY_STORE_MODE`（Worker）: `ceo_autonomous` 或 `session`。

## Metrics（建议接入）
- `memory_session_hit_rate`: `memory.search.hierarchy` 中 session tier 命中比例。
- `memory_consolidation_latency_ms`: consolidation 事件从请求到写入 promotion 的耗时。
- `memory_promotion_success_rate`: promotion 写入成功率。
- `memory_hierarchy_fallback_ratio`: 分层检索中回落到 company tier 的比例。

## Rollout Steps
1. 先仅开启 `ENABLE_SESSION_MEMORY=true`，观察 `memory.search.hierarchy` 命中与错误率。
2. 小流量开启 `ENABLE_MEMORY_CONSOLIDATION=true`，验证 worker 队列堆积与时延。
3. 开启 `ENABLE_AUTONOMOUS_MEMORY_ADAPTER=true`，观察 Autonomous heartbeat 成功率。
4. 需要会话写回时，将 `AUTONOMOUS_MEMORY_STORE_MODE=session`。

## Rollback Steps
1. 关闭 `ENABLE_AUTONOMOUS_MEMORY_ADAPTER`（Autonomous 回到旧 RPC 路径）。
2. 关闭 `ENABLE_MEMORY_CONSOLIDATION`（停止 consolidation 消费/触发）。
3. 关闭 `ENABLE_SESSION_MEMORY`（索引回到 `company/dept`）。
4. `memory.session.backfill.request` 任务可直接暂停，不影响在线读写。

