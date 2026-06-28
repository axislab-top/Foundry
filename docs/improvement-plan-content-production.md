# Foundry 内容产出能力改进计划

## 一、问题诊断

### 用户反馈
"连一个小说大纲都没法产出"

### 根因分析

当前系统有三条路径，**没有一条能正常产出内容**：

| 路径 | 默认 maxTokens | 实际产出 | 问题 |
|------|---------------|---------|------|
| evaluateDelegate (JSON 决策) | 700 | 200-400 字的 JSON | 输出的是决策结构，不是内容 |
| generateNaturalReply (light_reply) | 550 | 250-350 字 | 太短，且被 slice(0,4000) 截断 |
| Dispatch Plan + Temporal (重链路) | 4000-16000 | 理论 8000+ 字 | 链路太长，任何环节失败都无法产出 |

**核心矛盾**：light_reply 太短（250字），重链路太长（要走 Temporal），没有一条能正常工作。

### 架构根本问题

当前架构把 CEO 设计成"编排者"，而不是"执行者"：

```
当前：用户 → CEO(编排者) → 分发 → 部门主管(细化) → 员工(执行) → 结果
应该：用户 → Agent(执行者) → 直接产出 → 按需 @别人协同
```

**不需要**：
- Dispatch Plan（任务分配计划）
- Temporal 工作流（跨部门编排）
- 部门主管细化（任务拆解）
- 监督门闸（每个任务检查）
- 用户确认（propose/confirm）

**需要**：
- Intent（判断用户找的是谁）
- Agent 工具循环（Agent 直接干活）
- 按需协同（@别人请求帮助）

---

## 二、设计目标

### 用户体验目标

**简单任务**（Agent 独立完成）：
```
用户：写一个科幻小说大纲
CEO：好的，我来写。
（CEO 用工具循环写大纲）
CEO：大纲写好了：
---
# 科幻小说大纲
## 世界观设定
...
## 主线剧情
...
---
```

**需要协同的任务**（Agent @别人）：
```
用户：做一个新产品上线计划
CEO：这个需要市场部和产品部一起做。@市场主管 你负责市场推广部分，@产品主管 你负责产品功能部分。
市场主管：收到。
产品主管：收到。
（各自执行）
市场主管：市场推广方案写好了：...
产品主管：产品功能清单写好了：...
CEO：@用户 计划已经完成了，整合如下：...
```

**关键原则**：
- 所有交互都是群聊消息，没有卡片、没有按钮
- Agent 直接干活，不需要编排
- 按需协同，不需要协同就不协同
- 流式输出，用户实时看到进度

### 技术目标

| 目标 | 说明 |
|------|------|
| 只做一条链路 | Intent → Agent 直接干活 → 按需协同 → 输出结果 |
| 能产出任意长度内容 | maxTokens 不再硬钳制 |
| 流式输出 | 用户实时看到 Agent 的思考和产出 |
| 自然对话 | 所有消息都是群聊消息 |

---

## 三、架构改进方案

### 3.1 核心架构：单 Agent 工具循环

借鉴 Cursor / Claude Code 的 agent 模式，只做一条链路：

```
用户发消息
  ↓
Intent 判断：用户找的是谁？
  ├─ 找 CEO → CEO 接
  ├─ 找市场主管 → 市场主管接
  └─ 找某个员工 → 那个员工接
  ↓
被找的 Agent 直接干活（工具循环）：
  - 需要信息 → 调用查询工具
  - 需要写内容 → 直接写
  - 需要别人帮忙 → 在群里 @那个人
  - 被 @的人回复并协助
  ↓
Agent 流式输出结果
  ↓
用户实时看到进度
```

**与当前架构的对比**：

| | 当前架构 | 新架构 |
|---|---------|--------|
| 链路数量 | 3 条（light_reply / ceo_direct_execute / full_dispatch） | 1 条（Agent 工具循环） |
| CEO 角色 | 编排者（分配任务给别人） | 执行者（自己干活，按需 @别人） |
| 任务分配 | Dispatch Plan + Temporal | Agent 在群里 @别人 |
| 执行方式 | 部门主管细化 → 员工执行 | Agent 直接执行（工具循环） |
| 输出方式 | 批量输出 | 流式输出 |

### 3.2 Intent 层保留

Intent 层判断用户找的是谁，这个必须保留：

```typescript
// Intent 判断逻辑
function determineAgent(userMessage: string, roomMembers: Agent[]): Agent {
  // 1. 有明确 @某人 → 直接找那个人
  if (hasExplicitMention(userMessage)) return getMentionedAgent(userMessage);

  // 2. 没有 @ → 默认找 CEO（主群）或房间主人（部门群）
  return getDefaultAgent(room);
}
```

**Intent 的职责简化**：
- 只判断"谁来接话"
- 不判断"任务复杂度"
- 不判断"需要哪些部门"

### 3.3 Agent 工具循环

Agent 拿到任务后，用工具循环执行：

```typescript
async function agentLoop(agent: Agent, userMessage: string) {
  const messages = [
    { role: 'system', content: agent.systemPrompt },
    { role: 'user', content: userMessage }
  ];

  while (true) {
    // 1. Agent 思考
    const response = await llm.chat(messages, { tools: agent.tools });

    // 2. 如果有工具调用
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        // 执行工具
        const result = await executeTool(toolCall);
        messages.push({ role: 'tool', content: result });
      }
      continue; // 继续循环
    }

    // 3. 如果没有工具调用，输出结果
    return response.content;
  }
}
```

**Agent 可用的工具**：

| 工具 | 用途 |
|------|------|
| `memory.search` | 搜索历史记忆 |
| `facts.company.query` | 查询公司信息 |
| `room.message.send` | 在群里发消息（@某人） |
| `room.message.reply` | 回复某条消息 |
| `content.write` | 写内容（文档、方案等） |
| `task.create` | 创建任务 |
| `task.assign` | 分配任务给某人 |

### 3.4 按需协同

当 Agent 需要别人帮忙时，在群里 @那个人：

```typescript
// Agent 需要协同
async function requestCollaboration(agent: Agent, targetAgent: Agent, task: string) {
  // 1. Agent 在群里 @目标
  await room.message.send({
    content: `@${targetAgent.name} ${task}`,
    mentionedAgentIds: [targetAgent.id]
  });

  // 2. 目标 Agent 收到消息，开始执行
  // 3. 目标 Agent 执行完成后，在群里汇报
  // 4. 原 Agent 继续执行
}
```

**协同的触发条件**：
- Agent 自己判断需要别人帮忙
- 没有硬编码的规则
- Agent 根据任务内容和自己的能力决定

### 3.5 流式输出

Agent 的思考和产出实时输出到群聊：

```typescript
// 流式输出
async function streamOutput(agent: Agent, message: string) {
  const stream = await llm.chatStream(messages, { tools: agent.tools });

  for await (const chunk of stream) {
    // 实时输出到群聊
    await room.message.stream({
      agentId: agent.id,
      content: chunk.content
    });
  }
}
```

**用户体验**：
- 用户看到 Agent 边想边写
- 不需要等完成才看到结果
- 可以随时打断或补充信息

---

## 四、需要移除的模块

| 模块 | 文件 | 移除原因 |
|------|------|---------|
| Dispatch Plan | `ceo-dispatch-planning.service.ts` | 不再需要任务分配计划 |
| Dispatch Compiler | `ceo-dispatch-compiler.service.ts` | 不再需要 Markdown → 结构化转换 |
| Temporal 工作流 | `ceo-v2-root.workflow.ts` | 不再需要跨部门编排 |
| 部门主管细化 | `department-v2-sub.workflow.ts` | Agent 直接执行，不需要细化 |
| 监督门闸 | `supervisor-gate.activity.ts` | 不再需要每个任务检查 |
| Work Intent Compiler | `compile-work-intent.util.ts` | CEO 决策直接生效 |
| Propose/Confirm | `replay-authorization-handler.ts` | 不再需要用户确认 |

**需要保留的模块**：

| 模块 | 文件 | 保留原因 |
|------|------|---------|
| Intent 层 | `intent-layer.service.ts` | 判断用户找的是谁 |
| Room Context | `room-context.service.ts` | 获取房间信息 |
| CEO Layer Config | `ceo-layer-config-resolver.service.ts` | 获取 Agent 配置 |
| LLM Bridge | `collaboration-llm-bridge.service.ts` | 调用 LLM |
| Memory | `memory-cross-cut.service.ts` | 记忆检索 |
| Facts | `facts-gateway.service.ts` | 事实查询 |
| Direct Reply | `direct-collab-reply.service.ts` | 输出消息到群聊 |

---

## 五、需要新增的模块

### 5.1 Agent 工具循环服务

```typescript
// 新增：agent-tool-loop.service.ts
@Injectable()
export class AgentToolLoopService {
  async run(agent: Agent, userMessage: string, roomId: string): Promise<string> {
    const messages = this.buildInitialMessages(agent, userMessage);
    const tools = this.getAgentTools(agent);

    while (true) {
      const response = await this.llm.chat(messages, { tools });

      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall, roomId);
          messages.push({ role: 'tool', content: result });

          // 流式输出工具调用过程
          await this.streamToolCall(agent, toolCall, result);
        }
        continue;
      }

      return response.content;
    }
  }
}
```

### 5.2 协同请求服务

```typescript
// 新增：collaboration-request.service.ts
@Injectable()
export class CollaborationRequestService {
  async request(
    fromAgent: Agent,
    toAgent: Agent,
    task: string,
    roomId: string
  ): Promise<string> {
    // 1. 在群里 @目标 Agent
    await this.roomMessage.send({
      roomId,
      content: `@${toAgent.name} ${task}`,
      mentionedAgentIds: [toAgent.id]
    });

    // 2. 等待目标 Agent 回复
    const reply = await this.waitForReply(toAgent.id, roomId);

    return reply;
  }
}
```

### 5.3 流式输出服务

```typescript
// 新增：stream-output.service.ts
@Injectable()
export class StreamOutputService {
  async stream(
    agent: Agent,
    roomId: string,
    content: string
  ): Promise<void> {
    // 1. 创建流式消息
    const messageId = await this.roomMessage.createStream({
      roomId,
      agentId: agent.id,
    });

    // 2. 流式更新内容
    for (const chunk of this.splitIntoChunks(content)) {
      await this.roomMessage.updateStream(messageId, chunk);
    }

    // 3. 完成流式消息
    await this.roomMessage.finishStream(messageId);
  }
}
```

---

## 六、Agent 配置设计

### 6.1 Agent 能力定义

每个 Agent 有自己的能力配置：

```typescript
// Agent 配置
interface AgentConfig {
  id: string;
  name: string;
  role: 'ceo' | 'director' | 'executor';
  department: string;
  systemPrompt: string;
  tools: Tool[];  // 可用的工具列表
  maxTokens: number;  // 最大输出 tokens
  canCollaborate: boolean;  // 是否可以 @别人协同
  canBeCollaborated: boolean;  // 是否可以被别人 @
}
```

### 6.2 工具权限

不同角色的 Agent 有不同的工具权限：

| 角色 | 可用工具 |
|------|---------|
| CEO | 所有工具 |
| 主管 | 部门内工具 + 协同工具 |
| 员工 | 基础工具 |

### 6.3 maxTokens 配置

每个 Agent 的 maxTokens 通过 `ceo_layer_config` 配置，不再有硬上限：

```json
{
  "strategy": {
    "contextPolicy": {
      "replay": {
        "maxTokens": 8000
      }
    }
  }
}
```

---

## 七、消息格式设计

### 7.1 用户消息

```json
{
  "type": "human_message",
  "senderId": "user-id",
  "content": "写一个科幻小说大纲",
  "roomId": "main-room-id"
}
```

### 7.2 Agent 回复（流式）

```json
{
  "type": "agent_message",
  "senderId": "ceo-agent-id",
  "content": "好的，我来写一个科幻小说大纲。\n\n# 科幻小说大纲\n\n## 世界观设定\n...",
  "roomId": "main-room-id",
  "metadata": {
    "isStreaming": true,
    "streamId": "stream-xxx"
  }
}
```

### 7.3 Agent 协同请求

```json
{
  "type": "agent_message",
  "senderId": "ceo-agent-id",
  "content": "@市场主管 这个任务需要你帮忙，负责市场推广部分。",
  "roomId": "main-room-id",
  "metadata": {
    "mentionedAgentIds": ["market-director-agent-id"],
    "isCollaborationRequest": true
  }
}
```

### 7.4 协助 Agent 回复

```json
{
  "type": "agent_message",
  "senderId": "market-director-agent-id",
  "content": "收到，我来处理市场推广部分。",
  "roomId": "main-room-id",
  "metadata": {
    "replyTo": "ceo-message-id"
  }
}
```

---

## 八、实施计划

### Phase 0：紧急修复（1-2 天）

**目标**：让系统能产出内容。

| 改动 | 文件 | 说明 |
|------|------|------|
| 解除 maxTokens 硬钳制 | `main-room-replay-execution-delegate.service.ts` | `Math.min(2000,...)` → `Math.min(16000,...)` |
| 解除 maxTokens 硬钳制 | `ceo-natural-reply-generator.service.ts` | `Math.min(4000,...)` → `Math.min(16000,...)` |
| 解除输出截断 | `ceo-natural-reply-generator.service.ts` | `slice(0,4000)` → `slice(0,32000)` |
| 关闭确认门控 | `.env` | `COLLAB_MAIN_ROOM_REPLAY_EXECUTION_CONFIRM_GATE=false` |
| 调高默认 maxTokens | `ceo_layer_config` 数据库 | replay.maxTokens = 8000 |

**验证标准**：
- 用户发"写一个科幻小说大纲"，CEO 能回复 500+ 字的内容
- 不需要用户点确认

### Phase 1：Agent 工具循环（1-2 周）

**目标**：实现 Agent 工具循环，替代当前的编排流程。

| 改动 | 说明 |
|------|------|
| 新增 `AgentToolLoopService` | Agent 工具循环服务 |
| 实现 Agent 工具 | memory.search, facts.query, room.message.send 等 |
| 修改 Intent 层 | 只判断"谁来接话"，不判断"任务复杂度" |
| 修改 CEO 回复逻辑 | CEO 直接用工具循环执行，不走 Dispatch Plan |

**验证标准**：
- CEO 能用工具循环完成简单任务
- CEO 能在群里 @别人请求协同
- 输出是流式的，用户实时看到进度

### Phase 2：按需协同（2-4 周）

**目标**：实现 Agent 之间的协同。

| 改动 | 说明 |
|------|------|
| 新增 `CollaborationRequestService` | 协同请求服务 |
| 实现协同流程 | Agent @别人 → 别人回复 → 别人执行 → 别人汇报 |
| 修改 Agent 配置 | 支持 canCollaborate / canBeCollaborated |
| 移除 Dispatch Plan | 不再需要任务分配计划 |

**验证标准**：
- CEO 能 @市场主管，市场主管能回复并执行
- 市场主管能在群里汇报结果
- 整个过程像真人聊天

### Phase 3：流式输出（4-6 周）

**目标**：实现流式输出，用户实时看到进度。

| 改动 | 说明 |
|------|------|
| 新增 `StreamOutputService` | 流式输出服务 |
| 实现 WebSocket 流式消息 | 支持增量更新消息内容 |
| 修改前端 | 支持渲染流式消息 |
| 移除批量输出 | 不再等完成才看到结果 |

**验证标准**：
- 用户看到 Agent 边想边写
- 不需要等完成才看到结果
- 可以随时打断或补充信息

### Phase 4：清理（6-8 周）

**目标**：移除不需要的模块，简化架构。

| 改动 | 说明 |
|------|------|
| 移除 Dispatch Plan 相关模块 | ceo-dispatch-planning.service.ts 等 |
| 移除 Temporal 工作流相关模块 | ceo-v2-root.workflow.ts 等 |
| 移除 Work Intent Compiler | compile-work-intent.util.ts 等 |
| 移除 Propose/Confirm 相关模块 | replay-authorization-handler.ts 等 |
| 简化配置 | 移除不需要的配置项 |

**验证标准**：
- 代码量减少 30%+
- 架构清晰，只有一条链路
- 文档更新

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Agent 工具循环超时 | 任务失败 | 设置合理的超时时间（120-300秒） |
| Agent 协同时消息混乱 | 用户困惑 | 明确消息的因果关系（@ → 回复 → 汇报） |
| 流式输出时 WebSocket 断连 | 消息丢失 | 支持断线重连和消息补发 |
| 移除模块后功能缺失 | 功能回退 | 保留核心能力，只移除编排开销 |

---

## 十、验证标准

### Phase 0 验证

- [ ] 用户发"写一个科幻小说大纲"，CEO 能回复 500+ 字的内容
- [ ] 不需要用户点确认
- [ ] 回复是自然语言，不是 JSON

### Phase 1 验证

- [ ] CEO 能用工具循环完成简单任务
- [ ] CEO 能在群里 @别人请求协同
- [ ] 输出是流式的，用户实时看到进度

### Phase 2 验证

- [ ] CEO 能 @市场主管，市场主管能回复并执行
- [ ] 市场主管能在群里汇报结果
- [ ] 整个过程像真人聊天

### Phase 3 验证

- [ ] 用户看到 Agent 边想边写
- [ ] 不需要等完成才看到结果
- [ ] 可以随时打断或补充信息

### Phase 4 验证

- [ ] 代码量减少 30%+
- [ ] 架构清晰，只有一条链路
- [ ] 文档更新

---

## 十一、总结

**核心思想**：

1. **只做一条链路**：Intent → Agent 直接干活（工具循环）→ 按需协同 → 输出结果
2. **Agent 能独立产出**：每个 Agent 都能用工具循环完成任务
3. **按需协同**：需要别人帮忙时 @别人，不需要就不协同
4. **流式输出**：用户实时看到 Agent 的思考和产出
5. **自然对话**：所有消息都是群聊消息，没有卡片、按钮

**一句话**：让用户发一句话，Agent 直接干活，需要别人帮忙就 @别人，全程像真人聊天。
