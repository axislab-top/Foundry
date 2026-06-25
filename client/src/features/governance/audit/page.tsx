import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Play,
  User,
  Bot,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
} from "lucide-react";
import type { ComponentType } from "react";

/* ─── 类型 ─── */

type ActorType = "agent" | "human";
type ActionType = "create" | "update" | "delete" | "approve" | "execute";
type TimeRange = "today" | "week" | "month";

interface AuditLog {
  id: string;
  time: string;
  actor: string;
  actorType: ActorType;
  action: ActionType;
  description: string;
  target: string;
  source: string;
  result: "success" | "failed";
}

/* ─── 配置 ─── */

const ACTION_CONFIG: Record<
  ActionType,
  { label: string; icon: ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  create: { label: "创建", icon: Plus, color: "text-green-600", bg: "bg-green-50" },
  update: { label: "修改", icon: Pencil, color: "text-blue-600", bg: "bg-blue-50" },
  delete: { label: "删除", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
  approve: { label: "审批", icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-50" },
  execute: { label: "执行", icon: Play, color: "text-amber-600", bg: "bg-amber-50" },
};

const ALL_ACTION_TYPES: ActionType[] = ["create", "update", "delete", "approve", "execute"];
const ALL_TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];
const PAGE_SIZE = 20;

/* ─── Mock 数据（30 条，覆盖最近 7 天） ─── */

const MOCK_LOGS: AuditLog[] = [
  { id: "l1", time: "2026-05-13 10:32", actor: "Atlas", actorType: "agent", action: "execute", description: "完成用户认证模块代码审查", target: "PR #127", source: "Agent 自动", result: "success" },
  { id: "l2", time: "2026-05-13 10:28", actor: "Nova", actorType: "agent", action: "create", description: "生成竞品定价分析报告", target: "报告：竞品定价 Q2", source: "Agent 自动", result: "success" },
  { id: "l3", time: "2026-05-13 10:15", actor: "Pulse", actorType: "agent", action: "execute", description: "CI/CD 流水线构建部署到 staging", target: "部署：staging v2.3.1", source: "Agent 自动", result: "success" },
  { id: "l4", time: "2026-05-13 09:58", actor: "你", actorType: "human", action: "approve", description: "审批市场预算调整申请", target: "审批单：市场预算 Q2", source: "Web 端", result: "success" },
  { id: "l5", time: "2026-05-13 09:45", actor: "Sage", actorType: "agent", action: "execute", description: "社交媒体内容生成失败：API 限流", target: "任务：社媒内容排期", source: "Agent 自动", result: "failed" },
  { id: "l6", time: "2026-05-13 09:30", actor: "Flux", actorType: "agent", action: "execute", description: "ETL 数据清洗任务完成", target: "管道：用户行为数据", source: "Agent 自动", result: "success" },
  { id: "l7", time: "2026-05-13 09:12", actor: "你", actorType: "human", action: "update", description: "修改项目截止日期", target: "项目：数据中台建设", source: "Web 端", result: "success" },
  { id: "l8", time: "2026-05-13 08:45", actor: "Echo", actorType: "agent", action: "update", description: "更新客户画像标签", target: "客户：Acme Corp", source: "Agent 自动", result: "success" },
  { id: "l9", time: "2026-05-13 08:20", actor: "Pulse", actorType: "agent", action: "execute", description: "数据库连接池告警触发", target: "告警：DB 连接池", source: "Agent 自动", result: "failed" },
  { id: "l10", time: "2026-05-12 17:45", actor: "你", actorType: "human", action: "create", description: "创建新项目「AI 客服 PoC」", target: "项目：AI 客服 PoC", source: "Web 端", result: "success" },
  { id: "l11", time: "2026-05-12 16:30", actor: "Atlas", actorType: "agent", action: "update", description: "修复支付模块 Bug 并提交", target: "PR #126", source: "Agent 自动", result: "success" },
  { id: "l12", time: "2026-05-12 15:20", actor: "Nova", actorType: "agent", action: "create", description: "生成周报数据摘要", target: "报告：周报 W19", source: "Agent 自动", result: "success" },
  { id: "l13", time: "2026-05-12 14:10", actor: "你", actorType: "human", action: "approve", description: "审批新 Agent 招募申请", target: "审批单：招募 Concierge", source: "Web 端", result: "success" },
  { id: "l14", time: "2026-05-12 13:05", actor: "Flux", actorType: "agent", action: "execute", description: "数据管道任务超时后重试成功", target: "管道：订单数据同步", source: "Agent 自动", result: "success" },
  { id: "l15", time: "2026-05-12 11:40", actor: "Pulse", actorType: "agent", action: "update", description: "更新监控告警阈值配置", target: "配置：告警规则 v3", source: "Agent 自动", result: "success" },
  { id: "l16", time: "2026-05-12 10:00", actor: "你", actorType: "human", action: "delete", description: "删除过期的营销活动方案", target: "方案：春节营销 2025", source: "Web 端", result: "success" },
  { id: "l17", time: "2026-05-11 16:50", actor: "Echo", actorType: "agent", action: "execute", description: "自动回复客户投诉工单 #892", target: "工单：#892", source: "Agent 自动", result: "success" },
  { id: "l18", time: "2026-05-11 15:30", actor: "Atlas", actorType: "agent", action: "create", description: "创建数据库迁移脚本", target: "迁移：users_v4", source: "Agent 自动", result: "success" },
  { id: "l19", time: "2026-05-11 14:15", actor: "你", actorType: "human", action: "update", description: "调整 Agent 优先级配置", target: "配置：Agent 调度策略", source: "Web 端", result: "success" },
  { id: "l20", time: "2026-05-11 12:00", actor: "Nova", actorType: "agent", action: "execute", description: "竞品监控扫描完成，发现 3 个新动态", target: "任务：竞品日常监控", source: "Agent 自动", result: "success" },
  { id: "l21", time: "2026-05-11 10:30", actor: "Sage", actorType: "agent", action: "create", description: "撰写产品介绍文案初稿", target: "文案：产品介绍 v1", source: "Agent 自动", result: "success" },
  { id: "l22", time: "2026-05-10 17:20", actor: "你", actorType: "human", action: "approve", description: "审批技术架构变更方案", target: "审批单：架构变更 ADR-017", source: "Web 端", result: "success" },
  { id: "l23", time: "2026-05-10 15:45", actor: "Pulse", actorType: "agent", action: "execute", description: "SSL 证书续期任务执行", target: "任务：SSL 续期", source: "Agent 自动", result: "success" },
  { id: "l24", time: "2026-05-10 14:00", actor: "Flux", actorType: "agent", action: "update", description: "优化数据查询性能，响应时间降低 40%", target: "查询：用户行为分析", source: "Agent 自动", result: "success" },
  { id: "l25", time: "2026-05-10 11:30", actor: "Atlas", actorType: "agent", action: "delete", description: "清理过期的临时文件和缓存", target: "存储：临时文件", source: "Agent 自动", result: "success" },
  { id: "l26", time: "2026-05-09 16:10", actor: "你", actorType: "human", action: "create", description: "添加新客户「TechStart Inc」", target: "客户：TechStart Inc", source: "Web 端", result: "success" },
  { id: "l27", time: "2026-05-09 13:40", actor: "Echo", actorType: "agent", action: "update", description: "更新客户满意度调查结果", target: "调查：Q2 CSAT", source: "Agent 自动", result: "success" },
  { id: "l28", time: "2026-05-09 10:20", actor: "Nova", actorType: "agent", action: "execute", description: "邮件营销批次发送完成，成功率 98%", target: "营销：5 月推广邮件", source: "Agent 自动", result: "success" },
  { id: "l29", time: "2026-05-08 15:50", actor: "Pulse", actorType: "agent", action: "execute", description: "服务器扩容操作完成", target: "基础设施：Worker 扩容", source: "Agent 自动", result: "success" },
  { id: "l30", time: "2026-05-08 09:30", actor: "你", actorType: "human", action: "approve", description: "审批月度财务报表", target: "报表：4 月财务", source: "Web 端", result: "success" },
];

/* ─── 主页面 ─── */

export default function AuditLogPage() {
  const [actorFilter, setActorFilter] = useState<ActorType | "">("");
  const [actionFilter, setActionFilter] = useState<ActionType | "">("");
  const [timeRange, setTimeRange] = useState<TimeRange | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [showToast, setShowToast] = useState(false);

  // 筛选
  const filteredLogs = useMemo(() => {
    let result = MOCK_LOGS;

    if (actorFilter) {
      result = result.filter((l) => l.actorType === actorFilter);
    }
    if (actionFilter) {
      result = result.filter((l) => l.action === actionFilter);
    }
    if (timeRange) {
      const now = new Date("2026-05-13T10:32:00");
      let cutoff: Date;
      if (timeRange === "today") {
        cutoff = new Date("2026-05-13T00:00:00");
      } else if (timeRange === "week") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      result = result.filter((l) => new Date(l.time) >= cutoff);
    }
    if (keyword.trim()) {
      const lower = keyword.trim().toLowerCase();
      result = result.filter(
        (l) =>
          l.description.toLowerCase().includes(lower) ||
          l.actor.toLowerCase().includes(lower) ||
          l.target.toLowerCase().includes(lower),
      );
    }
    return result;
  }, [actorFilter, actionFilter, timeRange, keyword]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, page]);

  // 页码重置
  useEffect(() => {
    setPage(1);
  }, [actorFilter, actionFilter, timeRange, keyword]);

  // 统计
  const todayLogs = MOCK_LOGS.filter((l) => l.time.startsWith("2026-05-13"));
  const totalCount = todayLogs.length;
  const agentCount = todayLogs.filter((l) => l.actorType === "agent").length;
  const humanCount = todayLogs.filter((l) => l.actorType === "human").length;
  const failedCount = MOCK_LOGS.filter((l) => l.result === "failed").length;

  const handleExport = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      {/* 标题栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">审计日志</h2>
            <p className="mt-0.5 text-xs text-gray-500">Audit Log — 记录公司内所有操作行为的完整日志</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            导出日志
          </button>
        </div>
      </div>

      {/* 统计栏 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <span className="text-xs text-gray-500">今日操作总数</span>
          <p className="mt-2 text-xl font-bold text-gray-900">{totalCount}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.04 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <span className="text-xs text-gray-500">Agent 自动操作</span>
          <p className="mt-2 text-xl font-bold text-blue-600">{agentCount}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.08 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <span className="text-xs text-gray-500">人工操作</span>
          <p className="mt-2 text-xl font-bold text-purple-600">{humanCount}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.12 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <span className="text-xs text-gray-500">异常操作</span>
          <p className={`mt-2 text-xl font-bold ${failedCount > 0 ? "text-red-600" : "text-gray-900"}`}>{failedCount}</p>
        </motion.div>
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* 操作者筛选 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">操作者</span>
            <div className="flex gap-1">
              {[{ key: "" as const, label: "全部" }, { key: "agent" as const, label: "Agent" }, { key: "human" as const, label: "人工" }].map((opt) => (
                <button key={opt.key} type="button" onClick={() => setActorFilter(opt.key)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${actorFilter === opt.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          {/* 操作类型筛选 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">类型</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setActionFilter("")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${actionFilter === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>全部</button>
              {ALL_ACTION_TYPES.map((a) => (
                <button key={a} type="button" onClick={() => setActionFilter(actionFilter === a ? "" : a)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${actionFilter === a ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{ACTION_CONFIG[a].label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          {/* 时间范围 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">时间</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setTimeRange("")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${timeRange === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>全部</button>
              {ALL_TIME_RANGES.map((tr) => (
                <button key={tr.key} type="button" onClick={() => setTimeRange(timeRange === tr.key ? "" : tr.key)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${timeRange === tr.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{tr.label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          {/* 关键词搜索 */}
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索关键词..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
            />
            {keyword && (
              <button type="button" onClick={() => setKeyword("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-gray-400">{filteredLogs.length} 条记录</span>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* 表头 */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-5 py-2.5">
          <div className="grid grid-cols-[140px_80px_70px_1fr_180px_100px_60px] gap-3 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            <span>时间</span>
            <span>操作者</span>
            <span>类型</span>
            <span>操作描述</span>
            <span>关联对象</span>
            <span>来源</span>
            <span className="text-center">结果</span>
          </div>
        </div>

        {/* 日志行 */}
        <div>
          {paginatedLogs.map((log, index) => {
            const actionCfg = ACTION_CONFIG[log.action];
            const ActionIcon = actionCfg.icon;
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: index * 0.02 }}
                className="border-b border-gray-50 px-5 py-3 transition-colors hover:bg-gray-50/50"
              >
                <div className="grid grid-cols-[140px_80px_70px_1fr_180px_100px_60px] items-center gap-3">
                  <span className="text-xs text-gray-500">{log.time}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
                    {log.actorType === "agent" ? (
                      <Bot className="h-3 w-3 text-blue-500" />
                    ) : (
                      <User className="h-3 w-3 text-purple-500" />
                    )}
                    {log.actor}
                  </span>
                  <span className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${actionCfg.bg} ${actionCfg.color}`}>
                    <ActionIcon className="h-3 w-3" />
                    {actionCfg.label}
                  </span>
                  <span className="truncate text-xs text-gray-700">{log.description}</span>
                  <span className="truncate text-xs text-gray-500">{log.target}</span>
                  <span className="text-[11px] text-gray-400">{log.source}</span>
                  <span className="text-center">
                    {log.result === "success" ? (
                      <Check className="mx-auto h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <AlertCircle className="mx-auto h-3.5 w-3.5 text-red-500" />
                    )}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {paginatedLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Search className="h-10 w-10 mb-3 text-gray-300" />
              <p className="text-sm font-medium">暂无匹配的日志记录</p>
              <p className="mt-1 text-xs">尝试调整筛选条件</p>
            </div>
          )}
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一页
          </button>
          <span className="text-xs text-gray-500">
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            下一页
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 导出成功 Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" />
              导出成功
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
