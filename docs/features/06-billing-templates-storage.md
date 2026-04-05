# 6. 计费、模板与文件存储

## 6.1 计费（Billing）

- **BillingModule**：消费记录、预算、模型路由等 RPC；事件驱动路径包括消耗入账、任务完成计费、心跳刷新预算信号等（Worker：`BillingWorkerModule`）。
- 生产级「硬预算拦截、对账导出」等需按业务验收清单单独核对（见根目录《项目功能与能力说明》第 7 节）。

## 6.2 模板与 Agent 商城（Templates / Marketplace）

- **TemplatesModule**：模板预览、导入；导入完成后 **物化** 由 Worker（`TemplatesWorkerModule`）幂等处理。
- 网关中配置 **marketplace** 相关路由（Agent 列表/购买等），与模板域共同支撑内容与商业化场景。

## 6.3 文件与存储（Files）

- **FilesModule**：上传、列举、预签名 URL、下载、删除等；存储抽象通过 **MinIO / S3 / OSS / local** 等适配器切换（`apps/api/src/modules/files/storage`）。
- 对象存储与凭证依赖环境变量（参见 `.env.shared` 与部署说明）。

---

上一篇：[05-collaboration-memory-tasks.md](./05-collaboration-memory-tasks.md)  
下一篇：[07-worker-messaging-autonomous.md](./07-worker-messaging-autonomous.md)
