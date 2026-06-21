# 安全政策

> 📖 [English Version](SECURITY.md)

## 报告漏洞

如果你发现了安全漏洞，请**不要**通过公开 Issue 报告。

请发送邮件到 **postmaster@axislab.top**，包含：

1. 漏洞描述
2. 复现步骤
3. 潜在影响
4. 建议修复方案（如有）

我们会在 **48 小时**内确认收到，并在 **7 个工作日内**提供修复计划。

## 支持的版本

| 版本 | 支持状态 |
|------|---------|
| 最新 main 分支 | ✅ 支持 |
| 旧版本 | ❌ 不支持 |

## 安全最佳实践

部署 Foundry 时，请确保：

- [ ] 修改所有默认密码（JWT_SECRET、DB_PASSWORD、DEFAULT_ADMIN_PASSWORD）
- [ ] 使用强随机密钥（`openssl rand -base64 32`）
- [ ] 生产环境关闭 TEST_AUTH_ENABLED
- [ ] 生产环境关闭 SWAGGER_ENABLED
- [ ] 生产环境 DB_SYNCHRONIZE 设为 false
- [ ] 使用 HTTPS
- [ ] 配置防火墙，仅暴露必要端口
- [ ] 定期更新依赖（`pnpm update`）

## 已知安全注意事项

- `TEST_AUTH_ENABLED=true` 会允许通过 Header 注入任意用户身份，**仅限开发环境**
- 默认管理员密码为 `changeme`，**生产环境必须修改**
- RabbitMQ 默认使用 `guest:guest`，**生产环境必须修改**

## 致谢

感谢所有负责任地报告安全问题的研究者。
