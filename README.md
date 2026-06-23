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
| ![Group Chat](.github/images/screenshot-chat.png) | ![Admin Dashboard](.github/images/screenshot-dashboard.png) |

---

## 🚀 Quick Start

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 10+, macOS 12+, Ubuntu 20.04+ | Any 64-bit OS |
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 8 GB | 16 GB |
| **Disk** | 10 GB free | 20 GB+ free |
| **Docker** | 20.10+ | Latest stable |
| **Node.js** | 20+ | 22 LTS |
| **pnpm** | 10+ | Latest |

### What's Included (No Separate Installation Needed)

All infrastructure runs in Docker — **you don't need to install these separately**:

| Service | Purpose | Docker Image |
|---------|---------|--------------|
| PostgreSQL 18 | Main database | `postgres:18-alpine` |
| Redis 7 | Cache & sessions | `redis:7-alpine` |
| RabbitMQ 3 | Message queue | `rabbitmq:3-management` |
| Consul | Service discovery | `consul:latest` |
| Nginx | Reverse proxy | `nginx:alpine` |

### One Command Setup (Recommended)

```bash
git clone https://github.com/axislab-top/Foundry.git && cd Foundry
pnpm setup:dev   # copy env → install → start → migrate
```

### Or Step by Step

```bash
# 1. Clone the repository
git clone https://github.com/axislab-top/Foundry.git && cd Foundry

# 2. Install dependencies
pnpm install

# 3. Configure environment (optional — defaults work for local dev)
cp env.shared.example .env.shared

# 4. Start all services (infrastructure + application)
pnpm start:dev:local

# 5. Initialize database (create tables & seed data)
pnpm migrate:run
```

> ⏱️ **First launch takes 5-10 minutes** — Docker needs to download all images (~2 GB). Subsequent starts take ~30 seconds.

> 💡 **Windows users**: Run as Administrator if you encounter permission errors.

After containers are healthy and migrations complete, visit:

| Service | URL | Description |
|---------|-----|-------------|
| 🖥️ Client UI | http://localhost:5173 | Main interface (Vite dev server) |
| 🔧 Admin Panel | http://localhost:3105 | Administrator dashboard |
| 📡 API Service | http://localhost:3000/api-docs | API Swagger docs |
| 📡 Gateway | http://localhost:3002/api-docs | Gateway Swagger docs |
| 📊 Grafana | http://localhost:4000 | Log visualization (admin/admin) |
| 🐰 RabbitMQ | http://localhost:15672 | Message queue management (guest/guest) |

### Default Admin Account

The admin account is **automatically created** on first startup:

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Username | `admin` |
| Password | `changeme` |

> ⚠️ Change `DEFAULT_ADMIN_PASSWORD` in production environments.

### Useful Commands

```bash
pnpm infra:status    # Check container status
pnpm infra:logs      # View container logs
pnpm infra:stop      # Stop all containers
pnpm infra:restart   # Restart all containers
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Run `pnpm infra:stop` first, or change ports in `env.shared.example` |
| Docker not running | Start Docker Desktop and wait for it to be ready |
| Out of memory | Increase Docker memory limit to 8 GB+ in Docker Desktop settings |
| Slow on Windows | Enable WSL 2 backend for Docker Desktop |
| `getaddrinfo ENOTFOUND postgres` | You have a stale `.env` file with Docker hostnames. Delete `.env` and re-run `pnpm setup:dev` |
| RabbitMQ `ACCESS_REFUSED` | RabbitMQ container was created with wrong credentials. Run `pnpm infra:stop` then `pnpm setup:dev` again |
| Database connection timeout | PostgreSQL may be slow to start on Windows. The app will retry automatically (10s timeout) |

> 💡 **Diagnose database issues**: Run `node scripts/diagnose-db.js` in a separate terminal while the project is running.

### First Time Setup

After completing the steps above:

```bash
# 1. Login to Admin Panel at http://localhost:3105
#    Email: admin@example.com  Password: changeme

# 2. Configure LLM Keys (required for AI agents):
#    Admin Panel → LLM Keys → Add your OpenAI/Claude API key

# 3. Open Client UI at http://localhost:5173
#    Register a new account or login to start using the platform
```

### What's NOT Included (You Need to Configure)

| Item | Where to Configure | Why |
|------|-------------------|-----|
| LLM API Keys | Admin Panel → LLM Keys | Required for AI agents to work |
| Company Info | Admin Panel → Company | Your company name and industry |
| Agent Skills | Admin Panel → Skills | Enable/disable and configure skills |
| Email Settings | Admin Panel → Settings | For notifications (optional) |

> 💡 **Tip**: After logging into the Admin Panel, go to **LLM Keys** first and add at least one API key (OpenAI, Claude, etc.) — otherwise AI agents won't be able to respond.

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

### System Overview

```mermaid
graph TB
    subgraph user["👤 User Layer"]
        chat["💬 Chat UI<br/><i>Real-time WebSocket</i>"]
        admin["🖥️ Admin Panel<br/><i>Management Dashboard</i>"]
    end

    nginx["🔀 Nginx Reverse Proxy + SSL"]

    subgraph gateway["🚪 Gateway · port 3002"]
        gw_auth["🔐 JWT Auth + RBAC"]
        gw_ws["🔌 Socket.IO Hub"]
        gw_security["🛡️ HMAC / CSRF / Rate Limit"]
        gw_route["🔀 Dynamic Route Proxy"]
    end

    subgraph services["⚙️ Application Services"]
        api["📡 API Service · port 3000<br/><b>Business Control Plane</b><br/>46 entities · RLS multi-tenancy<br/>Billing · Memory+RAG · Skills"]
        worker["🧠 Worker Service · port 3004<br/><b>AI Orchestration Engine</b><br/>LangGraph Pipelines · Task Scheduler<br/>Tool Registry · Memory Consolidation"]
        webhook["🪝 Webhook Service · port 3003<br/>External event receive/forward/retry"]
    end

    subgraph infra["🏗️ Infrastructure"]
        pg[("🐘 PostgreSQL + pgvector<br/>RLS multi-tenancy · 46 tables<br/>Vector embeddings")]
        redis[("⚡ Redis 7<br/>Cache · Session · Pub/Sub")]
        rabbitmq[("🐇 RabbitMQ<br/>Event Bus · RPC Queues<br/>15 event domains")]
        minio[("📦 MinIO / S3 / OSS<br/>File storage")]
        temporal["⏱️ Temporal<br/>Heartbeat fanout · Approval wait<br/>Supervisor review"]
        grafana["📊 Grafana Stack<br/>Loki · Promtail · Grafana"]
    end

    subgraph runners["🔒 Execution"]
        runner["🏃 Runner · gVisor Sandbox<br/>Code execution · Command policy<br/>K8s Jobs isolation"]
    end

    chat --> nginx
    admin --> nginx
    nginx --> gateway

    gw_ws -- "Redis Pub/Sub<br/>collab:notify" --> redis
    gw_route -- "RPC proxy" --> api
    gw_route -- "RPC proxy" --> webhook

    api <== "RPC<br/>api-rpc-queue" ==> worker
    worker ==>|"RPC sandbox"| runner
    runner ==>|"RPC token"| api

    api --> pg
    api --> redis
    api --> rabbitmq
    worker --> rabbitmq
    webhook --> rabbitmq
    api --> minio
    worker --> pg

    style user fill:#e3f2fd,stroke:#1565c0,color:#000
    style gateway fill:#fff3e0,stroke:#e65100,color:#000
    style services fill:#e8f5e9,stroke:#2e7d32,color:#000
    style infra fill:#f3e5f5,stroke:#6a1b9a,color:#000
    style runners fill:#fce4ec,stroke:#b71c1c,color:#000
```

### Core Differentiator: Autonomous Heartbeat Loop

> The CEO Agent runs on a **~30min autonomous cycle** — no human prompt needed. Each cycle gathers context from 7 sources, plans via LLM, creates tasks, and streams a report back to chat.

```mermaid
graph LR
    subgraph cycle["⏰ Autonomous Heartbeat Cycle"]
        A["📋 TaskHeartbeatScheduler<br/><i>Round-robin across companies</i>"]
        B["📥 Ingest Context<br/>Dashboard · Memory RAG<br/>Budgets · Tasks · Lessons<br/>Org tree · Model routing"]
        C["🧠 CEO LLM Plan<br/><i>Structured output + Zod repair</i><br/>nextStep: generate_tasks | summary_only"]
        D["✅ Validate & Persist<br/>Create tasks via API RPC<br/>Pull agents into rooms"]
        E["📝 Summarize & Notify<br/>Stream report to chat room<br/>Store in memory · Request approval"]
        F["💾 Memory + Approval"]
    end

    A -- "~30min" --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F -.->|"repeat"| A

    style cycle fill:#fffde7,stroke:#f57f17,color:#000
```

### Core Differentiator: Collaboration Pipeline

> User messages trigger a **LangGraph state machine** with 4 intent paths and a **human-in-the-loop approval gate** (interrupt/resume).

```mermaid
graph TB
    msg["💬 User message in chat<br/><i>@CEO or @Agent</i>"]

    subgraph pipeline["CollaborationRoomPipeline · LangGraph"]
        classify["🎯 CEO LLM<br/>Classify Intent"]

        discuss["💬💬💬 Discussion<br/><i>Multi-agent moderated</i>"]
        direct["🤖 Single Reply<br/><i>@Agent direct answer</i>"]
        execute["📋 Task Execution<br/><i>CEO breaks down into tasks</i>"]
        gate["⏸️ Approval Gate<br/><i>LangGraph interrupt()</i><br/>Waits for human decision"]

        approve{"👤 Human<br/>Approve?"}
    end

    out["Agent responses → API persist<br/>→ Redis Pub/Sub → Socket.IO<br/>→ Client (200-char streaming chunks)"]

    msg --> classify
    classify -->|"discussion"| discuss
    classify -->|"direct"| direct
    classify -->|"execution"| execute
    classify -->|"approval"| gate

    gate --> approve
    approve -- "✅ 批准/approve" --> execute
    approve -- "❌ 拒绝/reject" --> out

    discuss --> out
    direct --> out
    execute --> out

    style pipeline fill:#e8eaf6,stroke:#283593,color:#000
    style gate fill:#fff9c4,stroke:#f9a825,color:#000
```

### End-to-End Core Flow

> The full lifecycle: from user goal to agent execution, cost tracking, failure review, and memory feedback — forming a **self-improving loop**.

```mermaid
graph TB
    subgraph trigger["🎯 Triggers"]
        user["💬 User @CEO in chat"]
        heartbeat["⏰ Heartbeat ~30min"]
        webhook_trig["🪝 External Webhook"]
    end

    plan["🧠 CEO LLM<br/>Break down goal into tasks<br/><i>Structured output + Zod repair</i>"]

    assign["📋 Task Assignment<br/>DAG: parent → sub-tasks<br/>Assign to department agents"]

    subgraph exec["⚙️ Agent Execution"]
        agent["🤖 Agent LLM<br/>Execute with skills + context"]
        skills["🔧 Skill Engine<br/>Tool calling (function schema)"]
        runner["🏃 Runner Sandbox<br/>gVisor K8s Job"]
    end

    result{{"✅❌ Task Result"}}

    subgraph cost["💰 Cost Control"]
        billing["📊 Token Billing<br/>per LLM call"]
        budget["💵 Budget Check<br/>company / dept / agent"]
        degrade["📉 Model Degradation<br/>fallback to cheaper model"]
        pause["🚫 Budget Exceeded<br/>pause autonomous ops"]
    end

    subgraph feedback["🔄 Memory Feedback Loop"]
        sup["🔍 Supervisor Review<br/>Post-mortem on failures"]
        lessons["📝 Lessons Learned<br/>LLM-generated insights"]
        memory["🧠 Memory RAG<br/>pgvector embeddings<br/>company → dept → agent"]
    end

    chat_out["💬 Streaming Report<br/>→ Chat Room (200-char chunks)<br/>→ Socket.IO → Client"]

    trigger --> plan
    plan --> assign
    assign --> exec
    agent --> skills
    skills -->|"code/commands"| runner
    runner --> result
    agent --> result

    result -->|"completed"| chat_out
    result -->|"failed"| sup
    sup --> lessons
    lessons --> memory
    memory -.->|"RAG search<br/>next heartbeat"| plan

    agent --> billing
    billing --> budget
    budget -->|"warning"| degrade
    budget -->|"exceeded"| pause
    degrade -.->|"cheaper model"| agent

    style trigger fill:#e3f2fd,stroke:#1565c0,color:#000
    style cost fill:#fff3e0,stroke:#e65100,color:#000
    style feedback fill:#e8f5e9,stroke:#2e7d32,color:#000
    style exec fill:#f3e5f5,stroke:#6a1b9a,color:#000
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
