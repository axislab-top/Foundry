# Foundry 项目真实检查文档（系列索引）

本目录为对仓库的**一次可追溯的静态检查**：结合 `apps/*` 入口、`app.module` 挂载、Worker 监听器清单、根脚本与 **2026-03-29 本地构建验证**，归纳**当前能支撑的用户需求**，并标明**边界与已知差距**。

与下列文档互补，不重复替代：

- 一页式能力总览与差距：仓库根目录 [`项目功能与能力说明.md`](../../项目功能与能力说明.md)
- 按域拆分的功能说明：[`docs/features/README.md`](../features/README.md)
- 路由级实现清单（偏 HTTP 枚举）：[`docs/architecture/implemented-features.md`](../architecture/implemented-features.md)
- 端到端架构图：[`架构.md`](../../架构.md)

---

## 阅读顺序

| 序号 | 文档 | 内容 |
|------|------|------|
| 1 | [01-inspection-report.md](./01-inspection-report.md) | 检查范围、客观结论、构建与代码事实 |
| 2 | [02-user-needs-matrix.md](./02-user-needs-matrix.md) | 用户需求/场景 ↔ 系统能力映射表 |
| 3 | [03-honest-boundaries.md](./03-honest-boundaries.md) | 交付边界、差距、环境与运维依赖 |

---

*若实现演进，请同步更新本系列及根目录《项目功能与能力说明》。*
