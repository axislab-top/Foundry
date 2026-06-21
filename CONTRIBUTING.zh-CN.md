# 贡献指南

感谢你对 Foundry 的关注！🎉

> 📖 [English Version](CONTRIBUTING.md)

---

## 如何贡献

| 类型 | 说明 | 链接 |
|------|------|------|
| 🐛 Bug 报告 | 发现了 Bug？告诉我们 | [提交 Issue](https://github.com/AxisLab-OPC/Foundry/issues/new?template=bug_report.yml) |
| 💡 功能建议 | 有好想法？分享它 | [提交 Issue](https://github.com/AxisLab-OPC/Foundry/issues/new?template=feature_request.yml) |
| 📝 文档 | 改进文档、修复错别字 | 直接提交 PR |
| 🔧 代码 | 修复 Bug、添加功能 | Fork → Branch → PR |

---

## 开发环境搭建

### 1. 前置要求

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose
- Git

### 2. Fork & 克隆

```bash
# 在 GitHub 上 Fork 仓库，然后：
git clone https://github.com/<你的用户名>/Foundry_01.git
cd Foundry_01
git remote add upstream https://github.com/AxisLab-OPC/Foundry.git
```

### 3. 安装 & 运行

```bash
pnpm install
pnpm start:dev:local
```

### 4. 保持同步

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

---

## 提交规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

### 类型 (type)

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建、工具、依赖 |
| `ci` | CI/CD 变更 |

### 作用域 (scope)

使用服务或包名作为 scope：

- `api`, `gateway`, `worker`, `webhooks`, `runner`, `temporal-worker`, `logging`
- `client-frontend`, `admin-system`
- `messaging`, `security`, `tenant`
- `docker`, `docs`

### 示例

```
feat(api): 新增批量创建任务接口
fix(gateway): 修复 JWT 重复验证问题
docs(readme): 更新快速开始指南
refactor(worker): 提取任务队列逻辑
```

---

## 代码规范

### TypeScript

- 启用严格模式
- 使用 `interface` 定义对象结构，`type` 定义联合/交叉类型
- 避免 `any` — 使用 `unknown` + 类型守卫
- 函数应有显式返回类型

### NestJS

- 使用 DTO 进行请求/响应验证
- 使用 Guard 进行认证/授权
- 使用 Interceptor 处理横切关注点
- Controller 保持精简，Service 承载业务逻辑

### React

- 函数组件 + Hooks
- 使用 TypeScript 定义 props 和 state
- 可复用逻辑抽取为自定义 Hook

---

## PR 流程

### 提交前检查

- [ ] 代码编译无误（`pnpm build`）
- [ ] Lint 通过（`pnpm lint`）
- [ ] TypeScript 检查通过（`pnpm tsc --noEmit`）
- [ ] 本地测试通过
- [ ] 提交信息符合规范

### PR 模板

创建 PR 时，请使用提供的模板并：

1. 描述你改了**什么**以及**为什么**
2. 关联相关 Issue
3. UI 变更添加截图
4. 进行中的工作标记为 Draft

### 审核流程

1. 维护者会审核你的 PR
2. 处理请求的修改
3. 审核通过后，PR 将被合并

---

## 项目结构

```
Foundry/
├── apps/                    # 微服务 (NestJS)
│   ├── api/                 #   核心 API
│   ├── gateway/             #   认证 & 路由
│   ├── worker/              #   后台任务
│   ├── webhooks/            #   Webhook 处理
│   ├── runner/              #   代码执行
│   ├── temporal-worker/     #   工作流
│   └── logging/             #   日志服务
├── admin-system/            # 管理后台 (React)
├── client-frontend/         # 用户端 (React)
├── packages/                # 共享包
├── infrastructure/          # 基础设施配置
├── contracts/               # 事件契约
├── deployment/              # Docker Compose 部署
└── docs/                    # 文档
```

---

## 报告安全问题

**不要**通过公开 Issue 报告安全漏洞。

请参阅 [SECURITY.md](SECURITY.md) 了解负责任的披露流程。

---

## 行为准则

请阅读我们的[行为准则](CODE_OF_CONDUCT.md)。我们期望所有贡献者遵守。

---

## 有问题？

- 💬 [GitHub Discussions](https://github.com/AxisLab-OPC/Foundry/discussions)
- 📧 邮箱：postmaster@axislab.top

---

感谢你让 Foundry 变得更好！❤️
