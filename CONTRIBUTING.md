# 贡献指南

感谢你对 Foundry 项目的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 报告 Bug

使用 [Bug 报告模板](https://github.com/axislab-top/Foundry/issues/new?template=bug_report.yml) 提交 Issue。请尽量提供：

- 清晰的问题描述
- 复现步骤
- 期望行为 vs 实际行为
- 日志或截图
- 环境信息（OS、Node 版本、Docker 版本）

### 提出功能建议

使用 [功能建议模板](https://github.com/axislab-top/Foundry/issues/new?template=feature_request.yml) 提交 Issue。

### 提交代码

1. **Fork** 本仓库
2. **创建分支**：`git checkout -b feature/your-feature-name`
3. **开发**：编写代码和测试
4. **检查**：确保 `pnpm lint` 和 `pnpm test` 通过
5. **提交**：遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
6. **推送**：`git push origin feature/your-feature-name`
7. **创建 PR**：使用 PR 模板填写说明

### Commit 规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

类型（type）：
- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档更新
- `style`：代码格式（不影响逻辑）
- `refactor`：重构
- `test`：测试
- `chore`：构建/工具变更

示例：
```
feat(api): 添加 Agent 技能市场功能
fix(gateway): 修复 WebSocket 认证过期后不断开连接的问题
docs: 更新 README 快速开始指南
```

## 开发环境

### 前置要求

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose

### 本地开发

```bash
# 克隆
git clone https://github.com/axislab-top/Foundry.git
cd Foundry

# 安装依赖
pnpm install

# 启动基础设施（PostgreSQL、Redis、RabbitMQ）
pnpm infra:start

# 启动开发服务器
pnpm dev
```

### 项目结构

```
apps/           # 微服务（api, gateway, worker, webhooks, runner...）
admin-system/   # 管理后台前端
client-frontend/# 用户端前端
packages/       # 共享包
infrastructure/ # 基础设施配置
contracts/      # 事件契约和 OpenAPI
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动所有服务（开发模式） |
| `pnpm build` | 构建所有服务 |
| `pnpm test` | 运行测试 |
| `pnpm lint` | 代码检查 |
| `pnpm infra:start` | 启动 Docker 基础设施 |
| `pnpm infra:stop` | 停止 Docker 基础设施 |

## 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 函数和类添加 JSDoc 注释
- 敏感信息（密码、密钥）使用环境变量，不硬编码

## 行为准则

请尊重所有参与者。我们致力于为每个人提供友好、安全和包容的环境。

## 问题？

如有任何问题，欢迎在 [Discussions](https://github.com/axislab-top/Foundry/discussions) 中提问。
