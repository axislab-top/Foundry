import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, List, Progress, Skeleton, Space, Tag } from 'antd';
import { useCompany } from '../../contexts/CompanyContext';
import { getHeartbeatReport } from '../../services/heartbeatApi';
import './heartbeat-page.css';

export const HeartbeatPage: React.FC = () => {
  const { companyId, isLoading: companiesLoading, error: companiesError, companies } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;
  const qHeartbeat = useQuery({
    queryKey: ['heartbeat', companyId],
    queryFn: getHeartbeatReport,
    enabled: tenantReady,
  });

  const showNoCompany = !companiesLoading && companies.length === 0 && !companiesError;
  const err = companiesError || qHeartbeat.error;
  const summary = qHeartbeat.data;

  const taskCompletion = useMemo(() => {
    const rows = summary?.company.taskCountsByStatus ?? {};
    const done = Number(rows.completed ?? 0);
    const total = Object.values(rows).reduce((acc, v) => acc + Number(v || 0), 0);
    if (!total) {
      return 0;
    }
    return Math.round((done / total) * 100);
  }, [summary]);

  const activeAgentCount = useMemo(() => {
    return summary?.agents.filter((a) => a.status === 'active').length ?? 0;
  }, [summary]);

  const riskTasks = useMemo(() => {
    const rows = summary?.tasks ?? [];
    return rows.filter((t) => t.status === 'blocked' || t.status === 'review' || Number(t.progress ?? 0) < 30).slice(0, 8);
  }, [summary]);

  const headline = useMemo(() => {
    if (!summary) {
      return '连接数据后将自动生成每日 Heartbeat 关键结论。';
    }
    const wf = summary.company.activeWorkflow;
    const latestMsg = summary.recentMessages[0]?.content?.trim();
    const parts = [
      `今日在办 ${wf.inProgress} 项，待办 ${wf.pending} 项，逾期 ${wf.overdueCount} 项。`,
      `活跃 Agent ${activeAgentCount} 名，任务完成率 ${taskCompletion}%。`,
    ];
    if (latestMsg) {
      parts.push(`主协作群最新动向：${latestMsg.slice(0, 80)}${latestMsg.length > 80 ? '…' : ''}`);
    }
    return parts.join(' ');
  }, [summary, activeAgentCount, taskCompletion]);

  return (
    <div className="content-area">
      <div className="page-header">
        <div>
          <div className="page-title">Heartbeat 日报</div>
          <div className="orgos-muted">聚合公司任务、Agent、预算与协作消息的每日节奏看板</div>
        </div>
        <Space>
          <Tag color="processing">实时数据</Tag>
          <Button onClick={() => void qHeartbeat.refetch()} loading={qHeartbeat.isFetching}>
            刷新
          </Button>
        </Space>
      </div>

      {showNoCompany ? <Alert type="warning" message="请先创建或选择公司，再查看 Heartbeat 日报。" showIcon /> : null}
      {err ? <Alert type="error" message={(err as Error).message} showIcon /> : null}

      {qHeartbeat.isLoading && tenantReady ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : null}

      <div className="heartbeat-kpi-grid">
        <Card>
          <div className="heartbeat-kpi-label">任务完成率</div>
          <div className="heartbeat-kpi-value">{taskCompletion}%</div>
          <Progress percent={taskCompletion} showInfo={false} />
        </Card>
        <Card>
          <div className="heartbeat-kpi-label">风险任务</div>
          <div className="heartbeat-kpi-value">{summary?.company.activeWorkflow.overdueCount ?? 0}</div>
          <div className="orgos-muted">逾期项</div>
        </Card>
        <Card>
          <div className="heartbeat-kpi-label">活跃 Agent</div>
          <div className="heartbeat-kpi-value">
            {summary?.company.agents.activeInTasks ?? 0}/{summary?.company.agents.totalActive ?? 0}
          </div>
          <div className="orgos-muted">参与任务 / 活跃总数</div>
        </Card>
        <Card>
          <div className="heartbeat-kpi-label">今日成本</div>
          <div className="heartbeat-kpi-value">
            {(summary?.billing.aggregates.todayCost ?? '0').toString()} {summary?.billing.budget?.currency ?? '¥'}
          </div>
          <div className="orgos-muted">累计 {summary?.billing.aggregates.recordCountMonth ?? 0} 条月度记录</div>
        </Card>
      </div>

      <div className="heartbeat-grid">
        <Card title="今日摘要">
          <p className="heartbeat-headline">{headline}</p>
          <div className="orgos-muted">
            更新于{' '}
            {summary?.generatedAt
              ? new Date(summary.generatedAt).toLocaleString()
              : '—'}
          </div>
        </Card>

        <Card title="任务状态分布">
          {Object.entries(summary?.company.taskCountsByStatus ?? {}).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务数据" />
          ) : (
            <div className="heartbeat-status-list">
              {Object.entries(summary?.company.taskCountsByStatus ?? {}).map(([status, count]) => (
                <div key={status} className="heartbeat-status-row">
                  <span>{statusLabel(status)}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="heartbeat-grid">
        <Card title="风险与关注任务">
          {riskTasks.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险任务" />
          ) : (
            <List
              dataSource={riskTasks}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={0}>
                    <strong>{item.title || item.id}</strong>
                    <span className="orgos-muted">
                      {statusLabel(item.status)} · 进度 {Math.round(Number(item.progress ?? 0))}%
                    </span>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title="预算与成本热点">
          {summary ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div className="heartbeat-hotspot">
                <div className="orgos-muted">Top Agent</div>
                <div>{renderTop(summary.billing.topAgents)}</div>
              </div>
              <div className="heartbeat-hotspot">
                <div className="orgos-muted">Top 任务</div>
                <div>{renderTop(summary.billing.topTasks)}</div>
              </div>
              <div className="heartbeat-hotspot">
                <div className="orgos-muted">Top 技能</div>
                <div>{renderTop(summary.billing.topSkills)}</div>
              </div>
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成本数据" />
          )}
        </Card>
      </div>
    </div>
  );
};

function statusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    pending: '待开始',
    in_progress: '进行中',
    review: '待验收',
    blocked: '阻塞',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[String(status)] ?? (status || '未知');
}

function renderTop(items: Array<{ id: string; cost: string }>): string {
  if (!items.length) {
    return '暂无';
  }
  return items
    .slice(0, 3)
    .map((x) => `${x.id}: ${x.cost}`)
    .join('  |  ');
}
