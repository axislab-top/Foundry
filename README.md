<p align="center">
  <img src=".github/images/logo.svg" width="150" alt="Foundry Logo">
</p>

<h1 align="center">Foundry</h1>

<p align="center">
  <strong>Open-Source AI Digital Company Platform — Let AI Teams Collaborate Like Real Ones</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">🇨🇳 中文文档</a> |
  <a href="https://www.axislab.top">🖥️ Live Demo</a> |
  <a href="#-quick-start">Quick Start</a> |
  <a href="#-features">Features</a> |
  <a href="#-architecture">Architecture</a> |
  <a href="#-comparison">Comparison</a> |
  <a href="docs/ARCHITECTURE.md">Docs</a> |
  <a href="#-contributing">Contributing</a>
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

## 🏭 What is Foundry?

Foundry is an **open-source AI-powered digital company platform**. Unlike agent frameworks where you have to orchestrate everything yourself, Foundry provides a **ready-to-use AI company** — just input a strategic goal and the AI company runs autonomously.

> 💡 **In one sentence**: If CrewAI is "building blocks for agents", Foundry is "the company already built."

**Typical scenario**: You say "Analyze competitors and create a report" in a group chat. The CEO Agent automatically breaks down the task, assigns it to the analysis department, executes in parallel, and summarizes the results — all you need to do is approve key decisions.

### 📸 Product Preview

| Registration | Organization Chart |
|:---:|:---:|
| ![Registration](.github/images/screenshot-register.png) | ![Organization Chart](.github/images/screenshot-org.png) |

| Group Chat | Admin Dashboard |
|:---:|:---:|
| ![Group Chat](.github/images/screenshot-chat.png) | *Coming Soon* |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Docker](https://www.docker.com/) + Docker Compose

### 3 Steps to Launch

```bash
# 1. Clone the repository
git clone https://github.com/axislab-top/Foundry.git && cd Foundry_01

# 2. Install dependencies
pnpm install

# 3. Start all services (infrastructure + application)
pnpm start:dev:local
```

Wait for Docker containers to start (first time takes ~2-3 minutes), then visit:

| Service | URL | Description |
|---------|-----|-------------|
| 🖥️ Client UI | http://localhost:3000 | Main interface |
| 🔧 Admin Panel | http://localhost:5173 | Administrator dashboard |
| 📡 API Docs | http://localhost:3000/api-docs | Swagger UI (dev environment) |

### Default Admin

```
Email: admin@example.com
Password: changeme
```

> ⚠️ Change `DEFAULT_ADMIN_PASSWORD` in production environments.

---

## ✨ Features

<details>
<summary><strong>🏗️ One-Click Company Creation</strong> — Input name and industry, auto-generate org structure</summary>

- Auto-generates Board → CEO → Department Head → Employee Agent hierarchy
- Built-in industry templates for one-click company initialization
- Drag-and-drop custom organization structure
</details>

<details>
<summary><strong>🤖 Multi-Agent Collaboration</strong> — Each agent has a role, like a real team</summary>

- CEO Agent handles strategic breakdown and task assignment
- Department Head Agent manages sub-task orchestration
- Employee Agent executes tasks (Skills, APIs, code execution)
- Customizable agent roles and capabilities
</details>

<details>
<summary><strong>💬 Real-time Group Chat</strong> — Not just conversations, true collaboration</summary>

- Dynamic group chat + streaming output + @mentions
- Human-in-the-loop approval flow (critical decisions need your confirmation)
- Real-time task progress push notifications
- Multi-company, multi-group-chat parallel operation
</details>

<details>
<summary><strong>🧠 Layered Memory System</strong> — Your AI company "learns"</summary>

- 3-tier memory: Company / Department / Agent level
- RAG intelligent retrieval (powered by pgvector)
- Automatic memory consolidation and decay
- Cross-session context preservation
</details>

<details>
<summary><strong>🔄 Autonomous Operation</strong> — No need to watch it constantly</summary>

- CEO Agent periodic Heartbeat review of pending tasks
- Task auto-breakdown → assignment → execution → reporting
- Temporal workflow engine ensures reliability
- Scheduled tasks and event-driven support
</details>

<details>
<summary><strong>💰 Cost & Governance</strong> — Every penny accounted for</summary>

- Real-time token consumption and cost tracking
- Company-level budget control
- Intelligent model routing (auto-select best cost-performance ratio)
- Full audit logging
- LLM Key pool management (multi-key rotation)
</details>

---

## 🏗️ Architecture

```
                         ┌─────────────────────┐
                         │  React Frontends (×2) │
                         │  Client / Admin Panel │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Nginx Reverse Proxy│
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │ Gateway (Auth/Route) │
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

> 📄 Full architecture documentation → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🆚 Comparison

| Feature | Foundry | CrewAI | MetaGPT | ChatDev | AutoGen |
|---------|---------|--------|---------|---------|---------|
| **Positioning** | AI Digital Company Platform | Agent Orchestration Framework | AI Software Company | Zero-code Dev Platform | Agent Programming Framework |
| **Ready to Use** | ✅ Complete platform | ❌ Needs orchestration | ⚠️ Code generation only | ⚠️ Code generation only | ❌ Needs coding |
| **Real-time Chat** | ✅ WebSocket | ❌ | ❌ | ❌ | ❌ |
| **Org Chart Visualization** | ✅ Drag-and-drop | ❌ | ⚠️ Fixed roles | ⚠️ Fixed roles | ❌ |
| **Layered Memory** | ✅ 3-tier + RAG | ❌ | ❌ | ❌ | ❌ |
| **Cost Control** | ✅ Budget + Routing | ❌ | ❌ | ❌ | ❌ |
| **Multi-tenancy** | ✅ RLS isolation | ❌ | ❌ | ❌ | ❌ |
| **Approval Flow** | ✅ Human-in-loop | ❌ | ❌ | ❌ | ❌ |
| **Admin Panel** | ✅ Separate frontend | ❌ | ❌ | ❌ | ✅ Studio |
| **Tech Stack** | NestJS + React | Python | Python | Python | Python + .NET |
| **License** | GPL-3.0 | MIT | MIT | Apache-2.0 | MIT |

> 💡 **Key difference**: Competitors are "frameworks" — you write code to orchestrate agents. Foundry is a "platform" — register and use it. Like the difference between Slack and IRC.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS (TypeScript) · 7 microservices |
| Frontend | React 18 · Vite · TypeScript |
| Build | pnpm workspace · Turborepo |
| Database | PostgreSQL (TypeORM + RLS multi-tenancy) · pgvector |
| Message Queue | RabbitMQ |
| Cache | Redis |
| AI Orchestration | LangChain · LangGraph |
| Real-time | Socket.IO (WebSocket) |
| Object Storage | MinIO / S3 / OSS / Local |
| Workflow | Temporal (optional) |
| Containerization | Docker Compose |

---

## 📁 Project Structure

```
Foundry/
├── apps/                    # Microservices
│   ├── api/                 #   API service (core business)
│   ├── gateway/             #   Gateway (auth, rate limiting, routing)
│   ├── worker/              #   Background tasks
│   ├── webhooks/            #   Webhook handling
│   ├── runner/              #   Code execution sandbox
│   ├── temporal-worker/     #   Temporal workflows
│   └── logging/             #   Logging service
├── admin-system/            # Admin panel frontend
├── client-frontend/         # Client frontend
├── packages/                # Shared packages (messaging, security, tenant...)
├── infrastructure/          # Infrastructure configs
├── contracts/               # Event contracts & OpenAPI
├── deployment/              # Docker Compose deployment
└── docs/                    # Documentation
```

---

## ⚙️ Environment Variables

Core configuration is documented in [`env.shared.example`](env.shared.example). Key variables:

```bash
# 🔴 Required (production)
JWT_SECRET=<openssl rand -base64 32>
DB_PASSWORD=<strong-password>
DEFAULT_ADMIN_PASSWORD=<strong-password>

# 🟡 Optional
TEST_AUTH_ENABLED=false          # Test user injection (dev only)
FILE_UPLOAD_MAX_SIZE=52428800    # File upload limit 50MB
KIBANA_ENCRYPTION_KEY=<key>      # Kibana (if using ELK)
```

---

## ❓ FAQ

<details>
<summary><strong>Q: How is Foundry different from CrewAI/AutoGen?</strong></summary>

CrewAI/AutoGen are **agent orchestration frameworks** — you write Python code to define agents, set up tools, and orchestrate workflows.

Foundry is an **AI digital company platform** — you register, create a company, and the AI runs automatically. No coding required.

Analogy: CrewAI is like building a PC from parts. Foundry is like buying a ready-to-use computer.
</details>

<details>
<summary><strong>Q: Which AI models are supported?</strong></summary>

Through LLM Key pool management, all major models are supported: OpenAI, Anthropic Claude, Azure OpenAI, and Chinese models (Qwen, Wenxin, etc.). Features multi-key rotation and intelligent routing.
</details>

<details>
<summary><strong>Q: Can I use it commercially?</strong></summary>

Yes. This project is open-sourced under GPL-3.0. Commercial use requires compliance with GPL-3.0 terms (derivative works must also be open-sourced). Contact us for commercial licensing.
</details>

<details>
<summary><strong>Q: How is data security ensured?</strong></summary>

- Multi-tenant RLS (Row-Level Security) isolation
- LLM Key encrypted storage (AES-256-GCM)
- JWT + RBAC access control
- Full audit logging
- All credentials managed via environment variables, never hardcoded
</details>

<details>
<summary><strong>Q: What are the minimum hardware requirements?</strong></summary>

- Development: 4GB RAM + 2 CPU (Docker)
- Production: 8GB RAM + 4 CPU (recommended)
- Storage: PostgreSQL + Redis + RabbitMQ + MinIO
</details>

---

## 🤝 Contributing

We welcome all forms of contribution!

| Type | How |
|------|-----|
| 🐛 Bug Report | [Open an Issue](https://github.com/axislab-top/Foundry/issues/new?template=bug_report.yml) |
| 💡 Feature Request | [Open an Issue](https://github.com/axislab-top/Foundry/issues/new?template=feature_request.yml) |
| 📝 Documentation | Submit a PR directly |
| 🔧 Code | Fork → Branch → PR |

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Contributors

<a href="https://github.com/axislab-top/Foundry/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=axislab-top/Foundry" />
</a>

---

## 📜 License

This project is licensed under [GPL-3.0](LICENSE).

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=axislab-top/Foundry&type=Date)](https://star-history.com/#axislab-top/Foundry&Date)

---

<p align="center">
  If you find this useful, please give us a ⭐ Star!<br>
  <a href="https://github.com/axislab-top/Foundry/stargazers">⭐ Star</a> •
  <a href="https://github.com/axislab-top/Foundry/fork">🍴 Fork</a> •
  <a href="https://github.com/axislab-top/Foundry/issues/new?template=bug_report.yml">🐛 Report Bug</a>
</p>
