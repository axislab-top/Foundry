import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../services/apiClient';
import { dashboardApi, type BillingSummary, type CompanyListItem, type CompanySummary, type PaginatedResult, type PlatformOverviewStats } from '../../services/dashboardApi';
import { alertsApi, type AdminAlert, type AlertSeverity } from '../../services/alertsApi';
import {
  Activity,
  AlertTriangle,
  Building2,
  Box,
  CheckCircle2,
  Cpu,
  CreditCard,
  Grid,
  List,
  MoreVertical,
  PieChart,
  RefreshCcw,
  ShieldAlert,
  TrendingUp,
  Zap,
  Clock,
} from 'lucide-react';

type CompanyStatus = 'draft' | 'active' | 'suspended' | 'archived';

interface AlertsQuery {
  page: number;
  pageSize: number;
  search?: string;
}

function formatNumber(v: number | string | null | undefined): string {
  if (v == null) return '-';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat().format(n);
}

function statusBadge(status: CompanyStatus): { label: string; className: string } {
  if (status === 'active') return { label: '运行中', className: 'badge badge-green' };
  if (status === 'suspended') return { label: '暂停', className: 'badge badge-gray' };
  if (status === 'archived') return { label: '归档', className: 'badge badge-gray' };
  return { label: '草稿', className: 'badge badge-gray' };
}

type CompanyRiskTag = { key: string; label: string; color: string; severity: AlertSeverity };

function computeBudgetRisk(
  utilization: number | null | undefined,
  warningThreshold?: string | number | null,
): CompanyRiskTag {
  if (utilization == null || !Number.isFinite(utilization)) {
    return { key: 'budget', label: '未知', color: 'rgba(148,163,184,0.7)', severity: 'low' };
  }

  const warn =
    typeof warningThreshold === 'string'
      ? Number(warningThreshold)
      : typeof warningThreshold === 'number'
        ? warningThreshold
        : null;

  if (utilization >= 1) return { key: 'budget', label: '预算超支', color: 'rgba(239, 68, 68, 0.95)', severity: 'high' };
  if (warn != null && Number.isFinite(warn)) {
    if (utilization >= warn) {
      return { key: 'budget', label: '预算即将超支', color: 'rgba(250, 204, 21, 0.95)', severity: 'medium' };
    }
    return { key: 'budget', label: '预算健康', color: 'rgba(34, 197, 94, 0.95)', severity: 'low' };
  }

  // Fallback: if warningThreshold isn't provided, use a conservative fixed threshold.
  if (utilization >= 0.8) return { key: 'budget', label: '预算即将超支', color: 'rgba(250, 204, 21, 0.95)', severity: 'medium' };
  return { key: 'budget', label: '预算健康', color: 'rgba(34, 197, 94, 0.95)', severity: 'low' };
}

function computeBacklogRisk(taskSummary?: CompanySummary): CompanyRiskTag | null {
  if (!taskSummary) return null;
  const pending = taskSummary.activeWorkflow.pending ?? 0;
  const overdue = taskSummary.activeWorkflow.overdueCount ?? 0;

  if (overdue >= 5 || pending >= 25) {
    return { key: 'backlog', label: '任务堆积严重', color: 'rgba(239, 68, 68, 0.95)', severity: 'high' };
  }
  if (overdue >= 1 || pending >= 10) {
    return { key: 'backlog', label: '任务堆积预警', color: 'rgba(250, 204, 21, 0.95)', severity: 'medium' };
  }
  return { key: 'backlog', label: '任务健康', color: 'rgba(34, 197, 94, 0.95)', severity: 'low' };
}

function computeAgentAnomalyRisk(taskSummary?: CompanySummary): CompanyRiskTag | null {
  if (!taskSummary) return null;
  const totalActive = taskSummary.agents.totalActive ?? 0;
  const activeInTasks = taskSummary.agents.activeInTasks ?? 0;
  if (totalActive <= 0) return null;
  const ratio = activeInTasks / Math.max(1, totalActive);

  // MVP: use “activeInTasks ratio” as a proxy. Real failure-rate/memory-anomaly will be wired in iter.
  if (ratio <= 0.2) {
    return { key: 'agent', label: 'Agent活跃度异常（近似）', color: 'rgba(250, 204, 21, 0.95)', severity: 'medium' };
  }
  return { key: 'agent', label: 'Agent状态正常', color: 'rgba(34, 197, 94, 0.95)', severity: 'low' };
}

function buildCompanyRiskTags(opts: { billingSummary?: BillingSummary | null; taskSummary?: CompanySummary | null }): CompanyRiskTag[] {
  const budget = computeBudgetRisk(opts.billingSummary?.budget?.utilization ?? null, opts.billingSummary?.budget?.warningThreshold ?? null);
  const backlog = computeBacklogRisk(opts.taskSummary ?? undefined);
  const agent = computeAgentAnomalyRisk(opts.taskSummary ?? undefined);

  const tags: CompanyRiskTag[] = [budget];

  // Only surface non-healthy optional tags to keep UI signal-to-noise high.
  if (backlog && backlog.severity !== 'low') tags.push(backlog);
  if (agent && agent.severity !== 'low') tags.push(agent);

  return tags;
}

export const DashboardPage: React.FC = () => {
  const page = 1;
  const pageSize = 20;
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  const [companies, setCompanies] = useState<PaginatedResult<CompanyListItem> | null>(null);
  const [companySummaries, setCompanySummaries] = useState<Record<string, CompanySummary>>({});
  const [billingSummaries, setBillingSummaries] = useState<Record<string, BillingSummary>>({});

  const [alerts, setAlerts] = useState<PaginatedResult<AdminAlert> | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [platformOverview, setPlatformOverview] = useState<PlatformOverviewStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAlertsError(null);
      setCompanies(null);
      setCompanySummaries({});
      setBillingSummaries({});
      setPlatformOverview(null);

      const params = {
        page,
        pageSize,
        search: undefined,
        sortBy: 'createdAt' as const,
        sortOrder: 'DESC' as const,
      };

      try {
        const res = await dashboardApi.listCompanies(params);
        if (cancelled) return;
        setCompanies(res);

        // For MVP: only fetch health for current page items.
        const ids = (res.items || []).map((c) => c.id).filter(Boolean);
        if (!ids.length) return;

        const healthPairs = await Promise.all(
          ids.map(async (companyId) => {
            const [taskSummaryRaw, billingSummaryRaw] = await Promise.all([
              dashboardApi.fetchCompanySummary(companyId),
              dashboardApi.fetchCompanyBillingSummary(companyId),
            ]);
            return {
              companyId,
              taskSummary: taskSummaryRaw,
              billingSummary: billingSummaryRaw,
            };
          }),
        );

        if (cancelled) return;
        setCompanySummaries(Object.fromEntries(healthPairs.map((x) => [x.companyId, x.taskSummary])));
        setBillingSummaries(Object.fromEntries(healthPairs.map((x) => [x.companyId, x.billingSummary])));
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load dashboard';
        setAlertsError(msg);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const companyIdsKey = useMemo(() => {
    return (companies?.items ?? []).map((c) => c.id).join(',');
  }, [companies]);

  useEffect(() => {
    if (!companies || !companyIdsKey) return;
    let cancelled = false;
    const ids = companies.items.map((c) => c.id);
    (async () => {
      try {
        const stats = await dashboardApi.platformOverview(ids);
        if (cancelled) return;
        setPlatformOverview(stats);
      } catch {
        if (cancelled) return;
        setPlatformOverview(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyIdsKey]);

  const loadAlerts = async (q: AlertsQuery) => {
    try {
      setAlertsError(null);
      const res = await alertsApi.list({ page: q.page, pageSize: q.pageSize, search: q.search });
      setAlerts(res);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load alerts';
      setAlertsError(msg);
    }
  };

  useEffect(() => {
    void loadAlerts({ page: 1, pageSize: 20, search: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const platformStats = useMemo(() => {
    if (platformOverview) return platformOverview;
    const comps = companies?.items ?? [];
    const totalCompanies = companies?.total ?? comps.length;

    let sumInProgress = 0;
    let sumPending = 0;
    let sumOverdue = 0;
    let sumAgentsTotal = 0;

    let used = 0;
    let total = 0;
    let todayCost = 0;

    const completedRates: number[] = [];

    for (const c of comps) {
      const s = companySummaries[c.id];
      const b = billingSummaries[c.id];
      if (s) {
        sumInProgress += s.activeWorkflow.inProgress ?? 0;
        sumPending += s.activeWorkflow.pending ?? 0;
        sumOverdue += s.activeWorkflow.overdueCount ?? 0;
        sumAgentsTotal += s.agents?.totalActive ?? 0;
        const done = s.taskCountsByStatus?.completed ?? 0;
        const denom =
          (s.taskCountsByStatus?.completed ?? 0) +
          (s.taskCountsByStatus?.in_progress ?? 0) +
          (s.taskCountsByStatus?.pending ?? 0) +
          (s.taskCountsByStatus?.review ?? 0);
        if (denom > 0) completedRates.push(done / denom);
      }

      if (b?.budget) {
        const u = Number(b.budget.usedAmount ?? 0);
        const t = Number(b.budget.totalAmount ?? 0);
        used += Number.isFinite(u) ? u : 0;
        total += Number.isFinite(t) ? t : 0;
      }
      if (b?.aggregates?.todayCost) {
        const cost = Number(b.aggregates.todayCost ?? 0);
        todayCost += Number.isFinite(cost) ? cost : 0;
      }
    }

    const budgetUtilization = total > 0 ? used / total : 0;
    const completionRate = completedRates.length ? completedRates.reduce((a, x) => a + x, 0) / completedRates.length : 0;
    const systemHealth = comps.length ? Math.max(0, 1 - sumOverdue / (comps.length * 5)) : 0.5;

    return {
      totalCompanies,
      sumInProgress,
      sumPending,
      sumOverdue,
      sumAgentsTotal,
      budgetUtilization,
      todayCost,
      completionRate,
      systemHealth,
      sparkToken24h: makeFakeSeries(todayCost, 24),
      sparkToken7d: makeFakeSeries(todayCost * 7, 14),
      sparkCreation7d: makeFakeSeries(Math.max(1, totalCompanies / 20), 14),
      sparkAutonomy: makeFakeSeries(completionRate, 14),
    };
  }, [billingSummaries, companies, companySummaries, platformOverview]);

  const companiesWithHealth = useMemo(() => {
    const items = companies?.items ?? [];
    return items.map((c) => {
      const taskSummary = companySummaries[c.id];
      const billingSummary = billingSummaries[c.id];
      return { company: c, taskSummary, billingSummary };
    });
  }, [billingSummaries, companies, companySummaries]);

  // Design.html: no realtime socket + no resolve modal; keep alerts read-only list.

  return (
    <div className="dash-page dash-page--v2">
      <div className="dash-layout">
        <div className="dash-left">
          <section className="dash-hero">
            <div className="dash-title-row">
              <div>
                <h2 className="dash-title-v2">
                  <TrendingUp size={20} className="dash-title-icon" />
                  平台健康概览
                </h2>
                <div className="dash-subtitle">一眼掌握公司运行情况与高优先级风险</div>
              </div>
              <button className="dash-link-btn" type="button" onClick={() => void loadAlerts({ page: 1, pageSize: 20 })}>
                <RefreshCcw size={14} /> 刷新告警
              </button>
            </div>

            <div className="dash-html-kpi-grid">
              {[
                {
                  id: '1',
                  label: '活跃 AI 公司',
                  value: formatNumber(platformStats.totalCompanies),
                  change: '实时',
                  trend: 'up' as const,
                  icon: Building2,
                  tone: 'blue' as const,
                },
                {
                  id: '2',
                  label: '进行中任务',
                  value: formatNumber(platformStats.sumInProgress + platformStats.sumPending),
                  change: '关注',
                  trend: 'neutral' as const,
                  icon: Activity,
                  tone: 'orange' as const,
                },
                {
                  id: '3',
                  label: '活跃 Agent 数',
                  value: formatNumber(platformStats.sumAgentsTotal),
                  change: '实时',
                  trend: 'up' as const,
                  icon: Cpu,
                  tone: 'purple' as const,
                },
                {
                  id: '4',
                  label: '今日 Token 消耗',
                  value: formatNumber(platformStats.todayCost),
                  change: '↑',
                  trend: 'up' as const,
                  icon: Zap,
                  tone: 'yellow' as const,
                },
                {
                  id: '5',
                  label: '预算使用率',
                  value: `${Math.round(platformStats.budgetUtilization * 100)}%`,
                  change: budgetRiskText(platformStats.budgetUtilization),
                  trend: 'neutral' as const,
                  icon: CreditCard,
                  tone: 'green' as const,
                },
                {
                  id: '6',
                  label: '系统健康度',
                  value: `${Math.round(platformStats.systemHealth * 100)}%`,
                  change: '优秀',
                  trend: 'up' as const,
                  icon: ShieldAlert,
                  tone: 'teal' as const,
                },
              ].map((k) => (
                <div key={k.id} className="dash-html-kpi-card">
                  <div className="dash-html-kpi-card-top">
                    <div className={`dash-html-kpi-icon dash-html-kpi-icon--${k.tone}`}>
                      <k.icon size={20} />
                    </div>
                    <span className={`dash-html-kpi-change dash-html-kpi-change--${k.trend}`}>{k.change}</span>
                  </div>
                  <div className="dash-html-kpi-card-mid">
                    <div className="dash-html-kpi-label">{k.label}</div>
                    <div className="dash-html-kpi-value">{k.value}</div>
                  </div>
                  <div className="dash-html-kpi-bar">
                    <div className="dash-html-kpi-bar-inner" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="dash-companies">
            <div className="dash-monitor-head">
              <div className="dash-monitor-title">
                <h3>AI 公司健康监控</h3>
                <span className="badge badge-gray">{companies?.items?.length ?? 0}</span>
              </div>

              <div className="dash-monitor-actions">
                <div className="dash-view-toggle" role="tablist" aria-label="View toggle">
                  <button
                    type="button"
                    className={`dash-view-toggle-btn${viewMode === 'card' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('card')}
                    aria-label="Card view"
                  >
                    <Grid size={18} />
                  </button>
                  <button
                    type="button"
                    className={`dash-view-toggle-btn${viewMode === 'table' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('table')}
                    aria-label="Table view"
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
            </div>

            {alertsError ? <div className="error-box">{alertsError}</div> : null}

            <div className="dash-html-company-panel">
              {companies ? (
                viewMode === 'card' ? (
                  <div className="dash-html-company-grid">
                    {companiesWithHealth.map(({ company, taskSummary, billingSummary }) => {
                      const budgetPct = Math.round((billingSummary?.budget?.utilization ?? 0) * 100);
                      const budgetColor = budgetPct > 90 ? 'var(--dash-rose)' : budgetPct > 70 ? 'var(--dash-orange)' : 'var(--dash-emerald)';
                      const status = statusBadge(company.status);
                      const inProgress = taskSummary?.activeWorkflow.inProgress ?? 0;
                      const pending = taskSummary?.activeWorkflow.pending ?? 0;
                      const risks = buildCompanyRiskTags({ billingSummary, taskSummary })
                        .filter((x) => x.severity !== 'low')
                        .map((x) => x.label);

                      return (
                        <div key={company.id} className="dash-html-company-card">
                          <div className="dash-html-company-head">
                            <div>
                              <div className="dash-html-company-name">{company.name}</div>
                              <div className="dash-html-company-sub">slug: {company.slug || '-'} | {company.industry || '-'}</div>
                            </div>
                            <span className={status.className}>{status.label}</span>
                          </div>

                          <div className="dash-html-company-split">
                            <div>
                              <div className="dash-html-micro-title">任务状态</div>
                              <div className="dash-html-task-pair">
                                <div className="dash-html-task-item">
                                  <div className="dash-html-task-val">{formatNumber(inProgress)}</div>
                                  <div className="dash-html-task-label">运行中</div>
                                </div>
                                <div className="dash-html-task-item">
                                  <div className="dash-html-task-val dash-html-warn">{formatNumber(pending)}</div>
                                  <div className="dash-html-task-label">待处理</div>
                                </div>
                              </div>
                            </div>

                            <div className="dash-html-company-budget">
                              <div className="dash-html-micro-title">预算使用</div>
                              <div className="dash-html-budget-track">
                                <div className="dash-html-budget-bar" style={{ width: `${Math.max(0, Math.min(100, budgetPct))}%`, background: budgetColor }} />
                              </div>
                              <div className="dash-html-budget-foot">{budgetPct}%</div>
                            </div>
                          </div>

                          <div className="dash-html-risk-row">
                            {risks.length ? (
                              risks.map((r) => (
                                <span key={r} className="dash-html-risk-chip">
                                  <AlertTriangle size={10} /> {r}
                                </span>
                              ))
                            ) : (
                              <span className="dash-html-ok">
                                <CheckCircle2 size={12} /> 正常
                              </span>
                            )}
                          </div>

                          <div className="dash-html-company-foot">
                            <button className="dash-html-soft" type="button">详情</button>
                            <button className="dash-html-more" type="button" aria-label="More">
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dash-html-table-wrap">
                    <table className="dash-html-table">
                      <thead>
                        <tr>
                          <th>公司名称</th>
                          <th>状态</th>
                          <th>预算</th>
                          <th>任务(P/W)</th>
                          <th>风险项</th>
                          <th style={{ textAlign: 'right' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companiesWithHealth.map(({ company, taskSummary, billingSummary }) => {
                          const budgetPct = Math.round((billingSummary?.budget?.utilization ?? 0) * 100);
                          const status = statusBadge(company.status);
                          const pending = taskSummary?.activeWorkflow.pending ?? 0;
                          const inProgress = taskSummary?.activeWorkflow.inProgress ?? 0;
                          const risks = buildCompanyRiskTags({ billingSummary, taskSummary }).filter((x) => x.severity !== 'low');
                          return (
                            <tr key={company.id}>
                              <td>
                                <div className="dash-html-table-name">{company.name}</div>
                                <div className="dash-html-table-sub">{company.industry || '-'}</div>
                              </td>
                              <td><span className={status.className}>{status.label}</span></td>
                              <td>
                                <div className="dash-html-budget-track dash-html-budget-track--table">
                                  <div className="dash-html-budget-bar" style={{ width: `${Math.max(0, Math.min(100, budgetPct))}%`, background: 'var(--dash-blue)' }} />
                                </div>
                              </td>
                              <td className="dash-html-mono">{formatNumber(pending)} / {formatNumber(inProgress)}</td>
                              <td>
                                {risks.length ? <AlertTriangle size={14} className="dash-html-risk-ico" /> : <CheckCircle2 size={14} className="dash-html-ok-ico" />}
                              </td>
                              <td style={{ textAlign: 'right' }}><button className="dash-html-link" type="button">查看</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="card">Loading...</div>
              )}
            </div>
          </section>

          <section className="dash-bottom">
            <div className="dash-bottom-grid">
              <div className="dash-panel card">
                <div className="dash-panel-head">
                  <div className="dash-panel-title">
                    <Zap size={18} className="dash-panel-icon dash-panel-icon--yellow" />
                    <span>快捷管理入口</span>
                  </div>
                </div>

                <div className="dash-action-grid">
                  {[
                    {
                      label: '创建公司模板',
                      icon: Box,
                      className: 'dash-action-icon dash-action-icon--blue',
                      onClick: () => alert('TODO: create template'),
                    },
                    {
                      label: '商户审核',
                      icon: ShieldAlert,
                      className: 'dash-action-icon dash-action-icon--rose',
                      onClick: () => alert('TODO: marketplace review'),
                    },
                    {
                      label: '模型路由',
                      icon: Activity,
                      className: 'dash-action-icon dash-action-icon--indigo',
                      onClick: () => (window.location.href = '/settings'),
                    },
                    {
                      label: '计费策略',
                      icon: CreditCard,
                      className: 'dash-action-icon dash-action-icon--green',
                      onClick: () => (window.location.href = '/settings'),
                    },
                  ].map((act) => (
                    <button key={act.label} className="dash-action-btn" type="button" onClick={act.onClick}>
                      <span className={act.className} aria-hidden="true">
                        <act.icon size={20} />
                      </span>
                      <span className="dash-action-label">{act.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dash-panel card">
                <div className="dash-panel-head">
                  <div className="dash-panel-title">
                    <PieChart size={18} className="dash-panel-icon dash-panel-icon--purple" />
                    <span>资源分配统计</span>
                  </div>
                </div>

                <div className="dash-dist-list">
                  {[
                    { label: 'GPT-4o 消耗', val: 75, bar: 'dash-dist-bar dash-dist-bar--purple' },
                    { label: 'Claude 3.5 消耗', val: 42, bar: 'dash-dist-bar dash-dist-bar--indigo' },
                    { label: 'Gemini Pro 消耗', val: 18, bar: 'dash-dist-bar dash-dist-bar--blue' },
                  ].map((x) => (
                    <div key={x.label} className="dash-dist-item">
                      <div className="dash-dist-row">
                        <span className="dash-dist-label">{x.label}</span>
                        <span className="dash-dist-value">{x.val}%</span>
                      </div>
                      <div className="dash-dist-track">
                        <div className={x.bar} style={{ width: `${x.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="dash-right">
          <section className="dash-alerts dash-alerts--v2">
            <div className="dash-alerts-head">
              <div className="dash-alerts-title">
                <ShieldAlert size={18} className="dash-alerts-title-icon" />
                <h3>全局告警中心</h3>
              </div>
              <button className="dash-icon-btn" type="button" aria-label="Refresh alerts" onClick={() => void loadAlerts({ page: 1, pageSize: 20 })}>
                <RefreshCcw size={14} />
              </button>
            </div>

            {alertsError ? <div className="error-box">{alertsError}</div> : null}

            <div className="dash-alerts-body">
              {alerts ? (
                <>
                  <div className="dash-alerts-feed dash-alerts-feed--v2">
                    {alerts.items.length ? (
                      alerts.items.map((a) => {
                        const tone = a.severity === 'high' ? 'high' : a.severity === 'medium' ? 'medium' : 'low';
                        return (
                          <div key={a.id} className={`dash-alert-card dash-alert-card--${tone}`}>
                            <div className="dash-alert-card-meta">
                              <span className="dash-alert-type-v2">{a.type}</span>
                              <span className="dash-alert-time-v2">
                                <Clock size={10} /> {formatRelativeTime(a.createdAt)}
                              </span>
                            </div>
                            <div className="dash-alert-msg-v2">{a.message}</div>
                            <div className="dash-alert-card-foot">
                              <span className="dash-alert-company">@{a.companyId || 'system'}</span>
                              {a.status === 'resolved' ? (
                                <span className="dash-alert-resolved">
                                  <CheckCircle2 size={12} /> 已解决
                                </span>
                              ) : (
                                <button className="dash-soft-btn" type="button" disabled>
                                  处理
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="dash-muted">暂无告警</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="card">Loading alerts...</div>
              )}
            </div>

            <div className="dash-alerts-stats-v2">
              <div className="dash-alerts-stat-v2">
                <div className="dash-alerts-stat-label">今日告警</div>
                <div className="dash-alerts-stat-value">{computeAlertsTodayCount(alerts?.items ?? [])}</div>
              </div>
              <div className="dash-alerts-stat-v2">
                <div className="dash-alerts-stat-label">解决率</div>
                <div className="dash-alerts-stat-value dash-ok">{computeAlertsResolveRate(alerts?.items ?? [])}</div>
              </div>
            </div>
          </section>
        </aside>

        {null}
      </div>
    </div>
  );
};

function makeFakeSeries(seed: number, count: number): number[] {
  // MVP: placeholder series until platform overview time-series endpoints land.
  const base = Math.max(0, seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 2) * 0.12 + Math.cos(i / 3) * 0.08;
    const jitter = (i % 3) * 0.03;
    out.push(base * (1 + wave + jitter));
  }
  return out;
}

function budgetRiskText(utilization: number): string {
  if (utilization >= 1) return '可能超支';
  if (utilization >= 0.8) return '即将超支';
  return '健康';
}

function formatRelativeTime(iso: string): string {
  const dt = new Date(iso);
  const ms = Date.now() - dt.getTime();
  if (!Number.isFinite(ms)) return iso;
  const min = Math.floor(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return `${d}天前`;
}

function computeAlertsTodayCount(items: AdminAlert[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return items.filter((a) => {
    const dt = new Date(a.createdAt);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  }).length;
}

function computeAlertsResolveRate(items: AdminAlert[]): string {
  if (!items.length) return '-';
  const resolved = items.filter((a) => a.status === 'resolved').length;
  return `${Math.round((resolved / items.length) * 100)}%`;
}


