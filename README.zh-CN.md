<p align="center">
  <img src=".github/images/logo.svg" width="150" alt="Foundry Logo">
</p>

<h1 align="center">Foundry</h1>

<p align="center">
  <strong>开源 AI 数字公司平台 — 让 AI 像真实团队一样协作</strong>
</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> |
  <a href="https://www.axislab.top">🖥️ 在线演示</a> |
  <a href="#-快速开始">快速开始</a> |
  <a href="#-核心功能">核心功能</a> |
  <a href="#-架构概览">架构</a> |
  <a href="#-与竞品对比">竞品对比</a> |
  <a href="docs/ARCHITECTURE.md">文档</a> |
  <a href="#-贡献">贡献</a>
</p>

<p align="center">
  <a href="https://github.com/axislab-top/Foundry/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License"></a>
  <a href="https://github.com/axislab-top/Foundry/stargazers"><img src="https://img.shields.io/github/stars/axislab-top/Foundry?style=social" alt="Stars"></a>
  <a href="https://github.com/axislab-top/Foundry/network/members"><img src="https://img.shields.io/github/forks/axislab-top/Foundry?style=social" alt="Forks"></a>
  <a href="https://github.com/axislab-top/Foundry/issues"><img src="https://img.shields.io/github/issues/axislab-top/Foundry" alt="Issues"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6" alt="TypeScript">
  <img src="https://img.shields.io/badge/NestJS-10-e0234e" alt="NestJS">
  <img src="https://img.shields.io/badge/React-18-61dafb" alt="React">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED" alt="Docker">
</p>

---

## 🏭 这是什么？

Foundry 是一套**开源的 AI 驱动数字公司平台**。不同于 Agent 框架（你需要自己编排），Foundry 提供**开箱即用的 AI 公司** — 你只需输入战略目标，AI 公司就能自主运行。

> 💡 **一句话理解**：如果 CrewAI 是"搭积木的框架"，Foundry 就是"已经搭好的公司"。

**典型场景**：你在群聊中说 "分析竞品并出一份报告"，CEO Agent 自动拆解任务、分配给分析部门、并行执行、汇总结果，全程你只需审批关键节点。

### 📸 产品预览

| 注册页 | 组织架构 |
|:---:|:---:|
| ![注册页](.github/images/screenshot-register.png) | ![组织架构](.github/images/screenshot-org.png) |

| 群聊协作 | 管理后台 |
|:---:|:---:|
| ![群聊协作](.github/images/screenshot-chat.png) | ![管理后台](.github/images/screenshot-dashboard.png) |

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Docker](https://www.docker.com/) + Docker Compose

### 3 步启动

```bash
# 1. 克隆仓库
git clone https://github.com/axislab-top/Foundry.git && cd Foundry_01

# 2. 安装依赖
pnpm install

# 3. 启动所有服务（基础设施 + 应用）
pnpm start:dev:local
```

等待 Docker 容器启动完成（首次约 2-3 分钟），然后访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 🖥️ 用户端 | http://localhost:3000 | 主界面 |
| 🔧 管理后台 | http://localhost:5173 | 管理员仪表盘 |
| 📡 API 文档 | http://localhost:3000/api-docs | Swagger UI（开发环境） |

### 默认管理员

```
邮箱: admin@example.com
密码: changeme
```

> ⚠️ 生产环境必须修改 `DEFAULT_ADMIN_PASSWORD` 环境变量。

---

## ✨ 核心功能

<details>
<summary><strong>🏗️ 一键创建公司</strong> — 输入名称和行业，自动生成组织架构</summary>

- 自动生成 董事会 → CEO → 部门主管 → 员工 Agent 的完整架构
- 内置行业模板，一键初始化公司配置
- 支持拖拽自定义组织架构
</details>

<details>
<summary><strong>🤖 多 Agent 协作</strong> — 各司其职，像真实团队一样工作</summary>

- CEO Agent 负责战略拆解和任务分配
- 部门主管 Agent 负责子任务编排
- 员工 Agent 负责具体执行（调用 Skills、API、代码执行）
- 支持自定义 Agent 角色和能力
</details>

<details>
<summary><strong>💬 实时群聊协作</strong> — 不只是对话，是真正的协作</summary>

- 动态群聊 + 流式输出 + @提及
- Human-in-the-loop 审批流（关键决策需要你确认）
- 任务进度实时推送
- 支持多公司、多群聊并行
</details>

<details>
<summary><strong>🧠 分层记忆系统</strong> — AI 公司会"学习"</summary>

- 公司级 / 部门级 / Agent 级三层记忆
- RAG 智能检索（基于 pgvector）
- 记忆自动沉淀和衰减
- 跨会话上下文保持
</details>

<details>
<summary><strong>🔄 自治运行</strong> — 不需要你盯着</summary>

- CEO Agent 定期 Heartbeat 审查待办
- 任务自动拆解 → 分配 → 执行 → 汇报
- Temporal 工作流引擎保障可靠性
- 支持定时任务和事件驱动
</details>

<details>
<summary><strong>💰 成本与治理</strong> — 每一分钱都清楚</summary>

- 实时 Token 消耗和费用统计
- 公司级预算控制
- 模型智能路由（自动选择性价比最优的模型）
- 完整审计日志
- LLM Key 池管理（多 Key 轮询）
</details>

---

## 🏗️ 架构概览

```
                         ┌─────────────────────┐
                         │   React 前端 (×2)    │
                         │  用户端 / 管理后台    │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Nginx 反向代理     │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  Gateway (认证/路由)  │
                         └──────────┬──────────┘
                                    │
           ┌────────────┬───────────┼───────────┬────────────┐
           │            │           │           │            │
     ┌─────▼─────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼─────┐
     │    API    │ │ Worker  │ │ Webhook │ │Temporal │ │  Runner  │
     │  Service  │ │ Service │ │ Service │ │ Worker  │ │ Service  │
     └─────┬─────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬─────┘
           │            │           │           │            │
     ┌─────▼────────────▼───────────▼───────────▼────────────▼─────┐
     │  PostgreSQL · Redis · RabbitMQ · MinIO · LangGraph · Temporal │
     └──────────────────────────────────────────────────────────────┘
```

> 📄 完整架构文档 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🆚 与竞品对比

| 特性 | Foundry | CrewAI | MetaGPT | ChatDev | AutoGen |
|------|---------|--------|---------|---------|---------|
| **定位** | AI 数字公司平台 | Agent 编排框架 | AI 软件公司 | 零代码开发平台 | Agent 编程框架 |
| **开箱即用** | ✅ 完整平台 | ❌ 需编排 | ⚠️ 仅代码生成 | ⚠️ 仅代码生成 | ❌ 需编程 |
| **实时群聊** | ✅ WebSocket | ❌ | ❌ | ❌ | ❌ |
| **组织架构可视化** | ✅ 拖拽编辑 | ❌ | ⚠️ 固定角色 | ⚠️ 固定角色 | ❌ |
| **分层记忆** | ✅ 3 层 + RAG | ❌ | ❌ | ❌ | ❌ |
| **成本控制** | ✅ 预算+路由 | ❌ | ❌ | ❌ | ❌ |
| **多租户** | ✅ RLS 隔离 | ❌ | ❌ | ❌ | ❌ |
| **审批流** | ✅ Human-in-loop | ❌ | ❌ | ❌ | ❌ |
| **管理后台** | ✅ 独立前端 | ❌ | ❌ | ❌ | ✅ Studio |
| **技术栈** | NestJS + React | Python | Python | Python | Python + .NET |
| **许可证** | GPL-3.0 | MIT | MIT | Apache-2.0 | MIT |

> 💡 **核心差异**：竞品是"框架"，你需要写代码编排 Agent。Foundry 是"平台"，注册就能用 — 就像 Slack 和 IRC 的区别。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | NestJS (TypeScript) · 7 个微服务 |
| 前端 | React 18 · Vite · TypeScript |
| 构建 | pnpm workspace · Turborepo |
| 数据库 | PostgreSQL (TypeORM + RLS 多租户) · pgvector |
| 消息队列 | RabbitMQ |
| 缓存 | Redis |
| AI 编排 | LangChain · LangGraph |
| 实时通信 | Socket.IO (WebSocket) |
| 对象存储 | MinIO / S3 / OSS / 本地存储 |
| 工作流 | Temporal (可选) |
| 容器化 | Docker Compose |

---

## 📁 项目结构

```
Foundry/
├── apps/                    # 微服务
│   ├── api/                 #   API 服务（核心业务）
│   ├── gateway/             #   网关（认证、限流、路由）
│   ├── worker/              #   后台任务
│   ├── webhooks/            #   Webhook 处理
│   ├── runner/              #   代码执行沙箱
│   ├── temporal-worker/     #   Temporal 工作流
│   └── logging/             #   日志服务
├── admin-system/            # 管理后台前端
├── client-frontend/         # 用户端前端
├── packages/                # 共享包 (messaging, security, tenant...)
├── infrastructure/          # 基础设施配置
├── contracts/               # 事件契约 & OpenAPI
├── deployment/              # Docker Compose 部署
└── docs/                    # 文档
```

---

## ⚙️ 环境变量

核心配置在 [`env.shared.example`](env.shared.example) 中有完整说明。关键变量：

```bash
# 🔴 必须修改（生产环境）
JWT_SECRET=<openssl rand -base64 32>
DB_PASSWORD=<强密码>
DEFAULT_ADMIN_PASSWORD=<强密码>

# 🟡 可选配置
TEST_AUTH_ENABLED=false          # 测试用户注入（仅开发）
FILE_UPLOAD_MAX_SIZE=52428800    # 文件上传限制 50MB
KIBANA_ENCRYPTION_KEY=<密钥>     # Kibana（如使用 ELK）
```

---

## ❓ FAQ

<details>
<summary><strong>Q: Foundry 和 CrewAI/AutoGen 有什么区别？</strong></summary>

CrewAI/AutoGen 是 **Agent 编排框架** — 你需要写 Python 代码来定义 Agent、设置工具、编排流程。

Foundry 是 **AI 数字公司平台** — 你注册账号、创建公司，AI 就自动运行了。不需要写代码。

类比：CrewAI 像买零件自己组装电脑，Foundry 像买整机直接用。
</details>

<details>
<summary><strong>Q: 支持哪些 AI 模型？</strong></summary>

通过 LLM Key 池管理，支持所有主流模型：OpenAI、Anthropic Claude、Azure OpenAI、国内模型（通义千问、文心一言等）。支持多 Key 轮询和智能路由。
</details>

<details>
<summary><strong>Q: 可以商用吗？</strong></summary>

可以。本项目基于 GPL-3.0 许可证开源。商用需要遵守 GPL-3.0 条款（衍生作品也需要开源）。如果你需要商业授权，请联系我们。
</details>

<details>
<summary><strong>Q: 数据安全如何保障？</strong></summary>

- 多租户 RLS（行级安全）隔离
- LLM Key 加密存储（AES-256-GCM）
- JWT + RBAC 权限控制
- 完整审计日志
- 所有凭证通过环境变量管理，不硬编码
</details>

<details>
<summary><strong>Q: 最低硬件要求？</strong></summary>

- 开发环境：4GB RAM + 2 CPU（Docker）
- 生产环境：8GB RAM + 4 CPU（推荐）
- 存储：PostgreSQL + Redis + RabbitMQ + MinIO
</details>

---

## 🤝 贡献

我们欢迎所有形式的贡献！

| 类型 | 说明 |
|------|------|
| 🐛 Bug 报告 | [提交 Issue](https://github.com/axislab-top/Foundry/issues/new?template=bug_report.yml) |
| 💡 功能建议 | [提交 Issue](https://github.com/axislab-top/Foundry/issues/new?template=feature_request.yml) |
| 📝 文档改进 | 直接提交 PR |
| 🔧 代码贡献 | Fork → Branch → PR |

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

### 贡献者

<a href="https://github.com/axislab-top/Foundry/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=axislab-top/Foundry" />
</a>

---

## 📜 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=axislab-top/Foundry&type=Date)](https://star-history.com/#axislab-top/Foundry&Date)

---

<p align="center">
  如果觉得有用，请给个 ⭐ Star 支持一下！<br>
  <a href="https://github.com/axislab-top/Foundry/stargazers">⭐ 给个 Star</a> •
  <a href="https://github.com/axislab-top/Foundry/fork">🍴 Fork 一下</a> •
  <a href="https://github.com/axislab-top/Foundry/issues/new?template=bug_report.yml">🐛 报告 Bug</a>
</p>
