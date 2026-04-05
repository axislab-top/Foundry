import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listAgents } from '../../services/agentsApi';
import { listTasks } from '../../services/tasksApi';
import {
  getBillingSummary,
  listBillingBudgets,
  listBillingRecords,
  upsertBillingBudget,
} from '../../services/billingApi';

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetThreshold, setBudgetThreshold] = useState('0.8');

  const qSummary = useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: getBillingSummary,
  });
  const qBudgets = useQuery({
    queryKey: ['billing', 'budgets'],
    queryFn: listBillingBudgets,
  });
  const qRecords = useQuery({
    queryKey: ['billing', 'records'],
    queryFn: () => listBillingRecords({ limit: 120, offset: 0 }),
  });
  const qAgents = useQuery({
    queryKey: ['billing', 'agents'],
    queryFn: () => listAgents({ page: 1, pageSize: 100 }),
  });
  const qTasks = useQuery({
    queryKey: ['billing', 'tasks'],
    queryFn: () => listTasks({ page: 1, pageSize: 100, rootOnly: true }),
  });

  const mUpsertBudget = useMutation({
    mutationFn: upsertBillingBudget,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing', 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['billing', 'budgets'] }),
      ]);
      setBudgetOpen(false);
    },
  });

  const summary = qSummary.data;
  const budget = summary?.budget;
  const monthCost = toNum(summary?.aggregates.monthCost);
  const todayCost = toNum(summary?.aggregates.todayCost);
  const recordCountMonth = summary?.aggregates.recordCountMonth ?? 0;
  const utilizationPct = Math.round((budget?.utilization ?? 0) * 100);
  const currency = budget?.currency ?? qBudgets.data?.[0]?.currency ?? 'USD';
  const remaining = Math.max(0, toNum(budget?.totalAmount) - toNum(budget?.usedAmount));

  const agentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of qAgents.data?.items ?? []) {
      map.set(a.id, a.name || a.id);
    }
    return map;
  }, [qAgents.data?.items]);

  const taskNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of qTasks.data?.items ?? []) {
      map.set(t.id, t.title || t.id);
    }
    return map;
  }, [qTasks.data?.items]);

  const modelStats = useMemo(() => {
    const records = qRecords.data?.items ?? [];
    const modelSet = new Set<string>();
    for (const r of records) {
      if (r.modelName) {
        modelSet.add(r.modelName);
      }
    }
    return {
      count: modelSet.size,
      names: Array.from(modelSet).slice(0, 3),
    };
  }, [qRecords.data?.items]);

  const topAgent = summary?.topAgents?.[0];
  const topAgentCost = toNum(topAgent?.cost);
  const topAgentRatio = monthCost > 0 ? Math.min(100, Math.round((topAgentCost / monthCost) * 100)) : 0;

  const topAgentRows = (summary?.topAgents ?? []).slice(0, 5);
  const recordsRows = (qRecords.data?.items ?? []).slice(0, 8);
  const trendRows = useMemo(() => buildDailyTrend(qRecords.data?.items ?? [], 7), [qRecords.data?.items]);
  const modelShareRows = useMemo(() => buildModelShare(qRecords.data?.items ?? [], 5), [qRecords.data?.items]);
  const isLoading =
    qSummary.isLoading || qBudgets.isLoading || qRecords.isLoading || qAgents.isLoading || qTasks.isLoading;
  const err = qSummary.error || qBudgets.error || qRecords.error;

  const handleSaveBudget = () => {
    const amount = Number(budgetAmount);
    const threshold = Number(budgetThreshold);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return;
    }
    mUpsertBudget.mutate({
      scope: 'company',
      period: 'monthly',
      totalAmount: amount,
      warningThreshold: threshold,
    });
  };

  const handleExportReport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      summary,
      budgets: qBudgets.data ?? [],
      records: recordsRows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="content-area">
      <div className="page-header">
        <div className="page-title">费用与治理中心</div>
        <div className="quick-actions">
          <button type="button" className="qa-btn" onClick={() => setBudgetOpen(true)}>
            设置预算
          </button>
          <button type="button" className="qa-btn" onClick={() => navigate('/audit')}>
            审计日志
          </button>
          <button type="button" className="qa-btn primary" onClick={handleExportReport}>
            导出报告
          </button>
        </div>
      </div>
      {err ? <Alert type="error" message={(err as Error).message} showIcon /> : null}
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : null}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">本月总费用</div>
          <div className="kpi-value">{fmtAmount(monthCost, currency)}</div>
          <div className="kpi-delta">
            预算 {fmtAmount(toNum(budget?.totalAmount), currency)} · 剩余 {fmtAmount(remaining, currency)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">最高消耗 Agent</div>
          <div className="kpi-value">{topAgent ? (agentNameMap.get(topAgent.id) ?? topAgent.id) : '—'}</div>
          <div className="kpi-delta">
            {fmtAmount(topAgentCost, currency)} · 占比 {topAgentRatio}%
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">API 调用次数</div>
          <div className="kpi-value">{formatCount(recordCountMonth)}</div>
          <div className="kpi-delta">本月计费记录数</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">模型分布</div>
          <div className="kpi-value">{modelStats.count} 种</div>
          <div className="kpi-delta">{modelStats.names.join(' / ') || '暂无模型数据'}</div>
        </div>
      </div>

      <div className="chart-row">
        <div className="panel">
          <div className="panel-title">预算执行进度</div>
          <div className="billing-budget-main">
            <div>
              <div className="billing-budget-value">{utilizationPct}%</div>
              <div className="orgos-muted">
                今日消耗 {fmtAmount(todayCost, currency)} · 本月 {fmtAmount(monthCost, currency)}
              </div>
            </div>
            <div className="billing-budget-right">
              <div className="orgos-muted">预警阈值 {Math.round(toNum(budget?.warningThreshold) * 100)}%</div>
              <div className={`billing-pill ${utilizationPct >= 100 ? 'danger' : utilizationPct >= 80 ? 'warn' : 'ok'}`}>
                {utilizationPct >= 100 ? '预算超限' : utilizationPct >= 80 ? '接近阈值' : '健康'}
              </div>
            </div>
          </div>
          <div className="progress-bar" style={{ marginTop: 12, height: 8 }}>
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">资源治理建议</div>
          <div className="task-list">
            <div className="task-item">
              <div className="task-name">统一高成本模型的默认路由策略</div>
              <span className="task-risk risk-med">建议</span>
            </div>
            <div className="task-item">
              <div className="task-name">超过阈值时触发审批流和降级策略</div>
              <span className="task-risk risk-med">建议</span>
            </div>
            <div className="task-item">
              <div className="task-name">按 Agent 绑定预算责任与审计追踪</div>
              <span className="task-risk risk-med">建议</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-row">
        <div className="panel">
          <div className="panel-title">近 7 天费用趋势</div>
          <div className="billing-trend">
            {trendRows.map((row) => (
              <div key={row.day} className="billing-trend-row">
                <div className="billing-trend-day">{row.day}</div>
                <div className="billing-trend-bar-wrap">
                  <div className="billing-trend-bar" style={{ width: `${row.ratio}%` }} />
                </div>
                <div className="billing-trend-cost">{fmtAmount(row.cost, currency)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">模型费用占比</div>
          <div className="billing-trend">
            {modelShareRows.length === 0 ? (
              <div className="orgos-muted">暂无模型占比数据</div>
            ) : (
              modelShareRows.map((row) => (
                <div key={row.model} className="billing-trend-row">
                  <div className="billing-trend-day" title={row.model}>
                    {row.model}
                  </div>
                  <div className="billing-trend-bar-wrap">
                    <div className="billing-trend-bar alt" style={{ width: `${row.ratio}%` }} />
                  </div>
                  <div className="billing-trend-cost">{row.ratio}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="section-row">
        <div className="panel">
          <div className="panel-title">各 Agent 费用明细</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topAgentRows.length === 0 ? (
              <div className="orgos-muted">暂无 Agent 账单数据</div>
            ) : (
              topAgentRows.map((a) => {
                const cost = toNum(a.cost);
                const ratio = monthCost > 0 ? Math.min(100, Math.round((cost / monthCost) * 100)) : 0;
                return (
                  <div key={a.id} className="agent-row">
                    <div className="agent-avatar">{(agentNameMap.get(a.id) ?? a.id).slice(0, 2).toUpperCase()}</div>
                    <div className="agent-info">
                      <div className="agent-name">{agentNameMap.get(a.id) ?? a.id}</div>
                      <div className="agent-role">占月度消耗 {ratio}%</div>
                    </div>
                    <div className="progress-bar" style={{ width: 140 }}>
                      <div className="progress-fill" style={{ width: `${ratio}%` }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 70, textAlign: 'right' }}>
                      {fmtAmount(cost, currency)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">最近账单记录</div>
          <div className="billing-record-list">
            {recordsRows.length === 0 ? (
              <div className="orgos-muted">暂无账单记录</div>
            ) : (
              recordsRows.map((r) => (
                <div key={r.id} className="billing-record-item">
                  <div>
                    <div className="billing-record-title">
                      {(r.agentId && agentNameMap.get(r.agentId)) || (r.taskId && taskNameMap.get(r.taskId)) || r.recordType || '记录'}
                    </div>
                    <div className="billing-record-meta">
                      {r.modelName || '未知模型'} · {new Date(r.occurredAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="billing-record-cost">{fmtAmount(toNum(r.cost), r.currency || currency)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal
        title="设置公司预算"
        open={budgetOpen}
        onCancel={() => setBudgetOpen(false)}
        onOk={handleSaveBudget}
        confirmLoading={mUpsertBudget.isPending}
        okText="保存预算"
      >
        <div className="billing-modal-grid">
          <label className="billing-field">
            <span>预算总额</span>
            <input
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="例如 10000"
              className="billing-input"
            />
          </label>
          <label className="billing-field">
            <span>预警阈值 (0-1)</span>
            <input
              value={budgetThreshold}
              onChange={(e) => setBudgetThreshold(e.target.value)}
              placeholder="例如 0.8"
              className="billing-input"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtAmount(amount: number, currency: string): string {
  const symbol = currency === 'CNY' || currency === 'RMB' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return `${n}`;
}

function buildDailyTrend(
  rows: Array<{ occurredAt: string; cost: string }>,
  days: number,
): Array<{ day: string; cost: number; ratio: number }> {
  const result = new Map<string, number>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.set(key, 0);
  }
  for (const row of rows) {
    const key = new Date(row.occurredAt).toISOString().slice(0, 10);
    if (!result.has(key)) {
      continue;
    }
    result.set(key, (result.get(key) || 0) + toNum(row.cost));
  }
  const max = Math.max(...Array.from(result.values()), 1);
  return Array.from(result.entries()).map(([day, cost]) => ({
    day: day.slice(5),
    cost,
    ratio: Math.round((cost / max) * 100),
  }));
}

function buildModelShare(
  rows: Array<{ modelName?: string | null; cost: string }>,
  limit: number,
): Array<{ model: string; ratio: number }> {
  const agg = new Map<string, number>();
  for (const row of rows) {
    const key = row.modelName || 'unknown';
    agg.set(key, (agg.get(key) || 0) + toNum(row.cost));
  }
  const total = Array.from(agg.values()).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return [];
  }
  return Array.from(agg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([model, cost]) => ({
      model,
      ratio: Math.round((cost / total) * 100),
    }));
}
