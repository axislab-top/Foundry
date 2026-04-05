import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Spin, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../../contexts/CompanyContext';
import { listAgents } from '../../services/agentsApi';
import { getBillingSummary, getCompanySummary } from '../../services/dashboardApi';
import type { BillingDashboardSummary, CompanyDashboardSummary } from '../../services/dashboardTypes';
import { listTasks } from '../../services/tasksApi';
import {
  agentRoleLabel,
  agentStatusClass,
  agentStatusText,
  avatarColor,
  computeTaskCompletionPercent,
  departmentLoadToBars,
  formatAmountDisplay,
  initialsFromName,
  taskRiskMeta,
  type DepartmentLoadBar,
} from './dashboardModel';

function buildCeoSuggestion(summary: CompanyDashboardSummary | undefined): string {
  if (!summary) {
    return '连接数据后将根据任务与预算情况生成建议。';
  }
  const { overdueCount, pending, inProgress } = summary.activeWorkflow;
  const nodes = summary.organization.nodes;
  const deptLoad = summary.departmentLoad ?? [];
  const deptCount = deptLoad.length;
  const deptWithWork = deptLoad.filter((d) => d.activeTasks > 0).length;
  const parts: string[] = [];
  if (overdueCount > 0) {
    parts.push(`当前有 ${overdueCount} 个逾期任务，建议优先处理或调整排期。`);
  }
  if (pending > 5) {
    parts.push(`待办任务 ${pending} 个，可关注队列与资源分配。`);
  }
  parts.push(
    `在办 ${inProgress} 个；组织节点 ${nodes} 个，部门 ${deptCount} 个${
      deptCount ? `，其中 ${deptWithWork} 个部门有在办任务` : ''
    }。数据更新于 ${new Date(summary.generatedAt).toLocaleString()}。`,
  );
  return parts.join('');
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const onboardShown = useRef(false);
  const { companyId, isLoading: companiesLoading, error: companiesError, companies } = useCompany();

  useEffect(() => {
    if (onboardShown.current) return;
    if (searchParams.get('onboard') === '1') {
      onboardShown.current = true;
      message.success('欢迎加入新公司！CEO 已就绪，可在协作与任务中开始。');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const tenantReady = Boolean(companyId) && !companiesLoading;

  const qSummary = useQuery({
    queryKey: ['dashboard', 'company', companyId],
    queryFn: getCompanySummary,
    enabled: tenantReady,
  });
  const qBilling = useQuery({
    queryKey: ['dashboard', 'billing', companyId],
    queryFn: getBillingSummary,
    enabled: tenantReady,
  });
  const qAgents = useQuery({
    queryKey: ['dashboard', 'agents', companyId],
    queryFn: () => listAgents({ page: 1, pageSize: 8 }),
    enabled: tenantReady,
  });
  const qTasks = useQuery({
    queryKey: ['dashboard', 'tasks', companyId],
    queryFn: () => listTasks({ page: 1, pageSize: 8, rootOnly: true }),
    enabled: tenantReady,
  });

  const company = qSummary.data;
  const billing = qBilling.data;

  const kpi = useMemo(() => deriveKpi(company, billing), [company, billing]);

  const deptBars = useMemo(() => departmentLoadToBars(company?.departmentLoad ?? []), [company?.departmentLoad]);

  const err = companiesError || qSummary.error || qBilling.error;
  const showNoCompany = !companiesLoading && companies.length === 0 && !companiesError;
  const loadingCore = companiesLoading || (tenantReady && (qSummary.isLoading || qBilling.isLoading));

  const agents = qAgents.data?.items ?? [];
  const tasks = qTasks.data?.items ?? [];

  return (
    <div className="content-area">
      <div className="page-header">
        <div>
          <div className="page-title">公司仪表盘</div>
        </div>
        <div className="quick-actions">
          <button type="button" className="qa-btn" onClick={() => navigate('/tasks')}>
            + 新战略
          </button>
          <button type="button" className="qa-btn primary" onClick={() => navigate('/heartbeat')}>
            查看 Heartbeat
          </button>
        </div>
      </div>

      {showNoCompany ? (
        <Alert
          type="warning"
          message="当前账号下没有可选公司，请先创建公司后再查看仪表盘。"
          showIcon
          style={{ marginBottom: 0 }}
        />
      ) : null}
      {err ? <Alert type="error" message={(err as Error).message} showIcon /> : null}

      {loadingCore && tenantReady ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : null}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">任务完成率</div>
          <div className="kpi-value">{kpi.taskRateLabel}</div>
          <div className="kpi-delta">{kpi.taskDelta}</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${kpi.taskBarPct}%` }} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">预算使用率</div>
          <div className="kpi-value">{kpi.budgetMain}</div>
          <div className={`kpi-delta${kpi.budgetWarn ? ' down' : ''}`}>{kpi.budgetSub}</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div
              className="progress-fill"
              style={{ width: `${kpi.budgetBarPct}%`, background: '#22D3EE' }}
            />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Agent 活跃度</div>
          <div className="kpi-value">{kpi.agentsMain}</div>
          <div className="kpi-delta">{kpi.agentsSub}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">费用与活动</div>
          <div className="kpi-value">{kpi.activityMain}</div>
          <div className="kpi-delta">{kpi.activitySub}</div>
        </div>
      </div>

      <div className="ceo-card">
        <div className="ceo-avatar">CEO</div>
        <div className="ceo-message">
          <div className="ceo-label">CEO 主动建议</div>
          <div className="ceo-text">
            {buildCeoSuggestion(company)}
            <span className="typing-dots" aria-hidden>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          </div>
        </div>
      </div>

      <div className="chart-row">
        <div className="panel">
          <div className="panel-title">部门任务负载</div>
          <p className="panel-subtitle">
            待开始 / 进行中 / 待验收任务，按归属部门汇总（指派给部门内 Agent 的任务会归入对应部门）
          </p>
          {qSummary.isLoading ? (
            <Spin />
          ) : (
            <DepartmentLoadChart bars={deptBars} />
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Agent 状态</div>
          {qAgents.isLoading ? (
            <Spin />
          ) : agents.length === 0 ? (
            <p className="orgos-muted" style={{ margin: 0 }}>
              暂无 Agent，请在 Agent 管理中创建。
            </p>
          ) : (
            <div className="agent-list">
              {agents.map((a, i) => (
                <div key={a.id} className="agent-row">
                  <div className="agent-avatar" style={{ background: avatarColor(i) }}>
                    {initialsFromName(a.name)}
                  </div>
                  <div className="agent-info">
                    <div className="agent-name">{a.name ?? a.id}</div>
                    <div className="agent-role">
                      {agentRoleLabel(a.role)}
                      {a.llmModel ? ` · ${a.llmModel}` : ''}
                    </div>
                  </div>
                  <span className={`agent-status ${agentStatusClass(a.status)}`}>{agentStatusText(a.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-row">
        <div className="panel">
          <div className="panel-title">进行中任务 · 风险预警</div>
          {qTasks.isLoading ? (
            <Spin />
          ) : tasks.length === 0 ? (
            <p className="orgos-muted" style={{ margin: 0 }}>
              暂无根任务。可在任务中心创建或拆解目标。
            </p>
          ) : (
            <div className="task-list">
              {tasks.map((t) => {
                const meta = taskRiskMeta(t);
                const pct = Math.min(100, Math.max(0, meta.pct));
                return (
                  <div key={t.id} className="task-item">
                    <div className="task-dot" style={{ background: meta.dotColor }} />
                    <div className="task-name">{t.title ?? t.id}</div>
                    <div className="task-pct">{pct}%</div>
                    <span
                      className={`task-risk ${meta.className}`.trim()}
                      style={
                        meta.label === '顺利'
                          ? {
                              background: 'var(--color-background-success)',
                              color: 'var(--color-text-success)',
                            }
                          : meta.label === '进行中'
                            ? {
                                background: 'var(--color-background-secondary)',
                                color: 'var(--color-text-secondary)',
                              }
                            : undefined
                      }
                    >
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">快捷操作</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="qa-btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigate('/tasks')}>
              下达新战略目标 ↗
            </button>
            <button
              type="button"
              className="qa-btn"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => navigate('/heartbeat')}
            >
              查看 Heartbeat 总结 ↗
            </button>
            <button
              type="button"
              className="qa-btn"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => navigate('/collaboration')}
            >
              打开主群聊 ↗
            </button>
            <button type="button" className="qa-btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigate('/billing')}>
              分析预算使用 ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function deriveKpi(
  company: CompanyDashboardSummary | undefined,
  billing: BillingDashboardSummary | undefined,
): {
  taskRateLabel: string;
  taskDelta: string;
  taskBarPct: number;
  budgetMain: string;
  budgetSub: string;
  budgetBarPct: number;
  budgetWarn: boolean;
  agentsMain: string;
  agentsSub: string;
  activityMain: string;
  activitySub: string;
} {
  if (!company) {
    return {
      taskRateLabel: '—',
      taskDelta: '加载后显示',
      taskBarPct: 0,
      budgetMain: '—',
      budgetSub: '加载后显示',
      budgetBarPct: 0,
      budgetWarn: false,
      agentsMain: '—',
      agentsSub: '—',
      activityMain: '—',
      activitySub: '—',
    };
  }

  const pct = computeTaskCompletionPercent(company.taskCountsByStatus);
  const { overdueCount, inProgress, pending } = company.activeWorkflow;
  const { activeInTasks, totalActive } = company.agents;

  const b = billing?.budget;
  const agg = billing?.aggregates;
  const currency = b?.currency ?? '¥';

  let budgetMain = '未设置预算';
  let budgetSub = '可在费用与治理中配置';
  let budgetBarPct = 0;
  let budgetWarn = false;
  if (b) {
    const ratio = typeof b.utilization === 'number' && Number.isFinite(b.utilization) ? b.utilization : 0;
    budgetBarPct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    budgetMain = `${budgetBarPct}%`;
    const used = formatAmountDisplay(b.usedAmount, currency);
    const total = formatAmountDisplay(b.totalAmount, currency);
    budgetSub = `已用 ${used} / 预算 ${total}`;
    const warn = parseFloat(b.warningThreshold);
    if (!Number.isNaN(warn) && warn <= 1 && ratio >= warn) {
      budgetWarn = true;
    }
  }

  let activityMain = '—';
  let activitySub = '计费摘要加载中';
  if (agg) {
    activityMain = formatAmountDisplay(agg.todayCost, currency);
    activitySub = `本月 ${formatAmountDisplay(agg.monthCost, currency)} · 记录 ${agg.recordCountMonth} 笔`;
  }

  return {
    taskRateLabel: `${pct}%`,
    taskDelta: `逾期 ${overdueCount} · 待办 ${pending} · 在办 ${inProgress}`,
    taskBarPct: pct,
    budgetMain,
    budgetSub,
    budgetBarPct,
    budgetWarn,
    agentsMain: totalActive > 0 ? `${activeInTasks}/${totalActive}` : '0/0',
    agentsSub: `活跃参与任务 / 公司内活跃 Agent`,
    activityMain,
    activitySub,
  };
}

const DepartmentLoadChart: React.FC<{ bars: DepartmentLoadBar[] }> = ({ bars }) => {
  if (bars.length === 0) {
    return (
      <p className="orgos-muted" style={{ margin: 0, lineHeight: 1.65 }}>
        当前公司下还没有「部门」组织节点。创建公司并完成组织初始化后，将按部门展示在办任务数；任务指派给部门下的
        Agent 后也会计入对应部门。
      </p>
    );
  }
  return (
    <div className="department-load-chart" role="img" aria-label="各部门在办任务负载">
      <div className="department-load-chart__track">
        {bars.map((b) => (
          <div key={b.organizationNodeId} className="department-load-chart__col">
            <span className="department-load-chart__count">{b.activeTasks}</span>
            <div className="department-load-chart__bar-wrap">
              <div
                className="department-load-chart__bar"
                style={{ height: `${b.heightPct}%` }}
                title={`${b.name}：${b.activeTasks} 个在办任务`}
              />
            </div>
            <span className="department-load-chart__label" title={b.name}>
              {b.name.length > 8 ? `${b.name.slice(0, 7)}…` : b.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
