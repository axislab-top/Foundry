import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import { useCompany } from '../../contexts/CompanyContext';
import { getCompanySummary } from '../../services/dashboardApi';
import type { CompanyDashboardSummary } from '../../services/dashboardTypes';
import { collectDepartmentNodes } from '../../lib/organizationTree';
import { getOrganizationTree, type OrganizationTreeNode } from '../../services/organizationApi';
import { listTasks, requestBreakdown, type ListTasksParams, type TaskEntity, type TaskStatus } from '../../services/tasksApi';
import { taskRiskMeta } from '../dashboard/dashboardModel';

import './tasks-page.css';

const PAGE_SIZE = 12;

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'review', label: '待验收' },
  { value: 'blocked', label: '阻塞' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

function deptActiveCount(load: CompanyDashboardSummary['departmentLoad'], id: string): number {
  const row = load.find((d) => d.organizationNodeId === id);
  return row?.activeTasks ?? 0;
}

function statusLabel(st: string | undefined): string {
  const m: Record<string, string> = {
    pending: '待开始',
    in_progress: '进行中',
    review: '待验收',
    completed: '已完成',
    blocked: '阻塞',
    cancelled: '已取消',
  };
  return m[String(st)] ?? (st || '—');
}

function priorityLabel(p: string | undefined): string | null {
  if (!p || p === 'normal') {
    return null;
  }
  const m: Record<string, string> = {
    low: '低',
    high: '高',
    urgent: '紧急',
  };
  return m[p] ?? p;
}

function formatDue(d: string | null | undefined): string {
  if (!d) {
    return '未设截止日';
  }
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) {
    return '未设截止日';
  }
  return `截止 ${new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

type TaskScope = { kind: 'company' } | { kind: 'department'; nodeId: string; name: string };

export const TasksPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { companyId, isLoading: companiesLoading, error: companiesError, companies } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [scope, setScope] = useState<TaskScope>({ kind: 'company' });
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalText, setGoalText] = useState('');

  const qTree = useQuery({
    queryKey: ['organization', 'tree', companyId],
    queryFn: getOrganizationTree,
    enabled: tenantReady,
  });

  const departments = useMemo(() => collectDepartmentNodes(qTree.data ?? []).slice(0, 8), [qTree.data]);

  const qSummary = useQuery({
    queryKey: ['dashboard', 'company', companyId],
    queryFn: getCompanySummary,
    enabled: tenantReady,
  });

  const listParams = useMemo((): ListTasksParams => {
    const base: ListTasksParams = {
      page,
      pageSize: PAGE_SIZE,
      rootOnly: true,
    };
    if (statusFilter !== 'all') {
      base.status = statusFilter;
    }
    if (scope.kind === 'department') {
      base.departmentOrganizationNodeId = scope.nodeId;
    }
    return base;
  }, [page, statusFilter, scope]);

  const qTasks = useQuery({
    queryKey: ['tasks', 'list', companyId, listParams],
    queryFn: () => listTasks(listParams),
    enabled: tenantReady,
  });

  /** Root-task total for the company (unfiltered by department) — used on the「公司级」chip */
  const qRootTotal = useQuery({
    queryKey: ['tasks', 'root-count', companyId],
    queryFn: () => listTasks({ page: 1, pageSize: 1, rootOnly: true }),
    enabled: tenantReady,
    select: (d) => d.total,
  });

  const breakdownMut = useMutation({
    mutationFn: (goal: string) => requestBreakdown({ goal: goal.trim(), context: {} }),
    onSuccess: () => {
      message.success('已提交目标拆解，任务刷新中');
      setGoalOpen(false);
      setGoalText('');
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'company'] });
    },
    onError: (e: Error) => {
      message.error(e.message || '提交失败');
    },
  });

  const wf = qSummary.data?.activeWorkflow;
  const load = qSummary.data?.departmentLoad ?? [];

  const err = companiesError || qTasks.error || qSummary.error || qTree.error;
  const showNoCompany = !companiesLoading && companies.length === 0 && !companiesError;
  const loadingCore = companiesLoading || (tenantReady && (qTasks.isLoading || qSummary.isLoading));

  const onScopeCompany = () => {
    setScope({ kind: 'company' });
    setPage(1);
  };

  const onScopeDept = (n: OrganizationTreeNode) => {
    setScope({ kind: 'department', nodeId: n.id, name: n.name });
    setPage(1);
  };

  const onStatusChange = (v: TaskStatus | 'all') => {
    setStatusFilter(v);
    setPage(1);
  };

  const items = qTasks.data?.items ?? [];
  const total = qTasks.data?.total ?? 0;

  return (
    <div className="content-area tasks-hub">
      <header className="tasks-hub__header">
        <div>
          <h1 className="tasks-hub__title">任务与自治中心</h1>
          <p className="tasks-hub__subtitle">
            根任务来自真实接口；按部门筛选时与仪表盘「部门任务负载」归属口径一致（含指派给部门下 Agent 的任务）。
          </p>
        </div>
        <Space wrap className="tasks-hub__actions">
          <Button type="primary" onClick={() => setGoalOpen(true)}>
            输入大目标
          </Button>
          <Button onClick={() => message.info('甘特视图开发中')}>甘特视图</Button>
          <Button onClick={() => message.info('看板视图开发中')}>Kanban</Button>
        </Space>
      </header>

      {err ? <Alert type="error" message={(err as Error).message} showIcon /> : null}
      {showNoCompany ? (
        <Alert type="warning" message="请先创建或选择公司后再查看任务。" showIcon />
      ) : null}

      {tenantReady && qSummary.data ? (
        <div className="tasks-hub__kpi">
          <div className="tasks-hub__kpi-card">
            <div className="tasks-hub__kpi-label">进行中</div>
            <div className="tasks-hub__kpi-value">{wf?.inProgress ?? 0}</div>
          </div>
          <div className="tasks-hub__kpi-card">
            <div className="tasks-hub__kpi-label">待办</div>
            <div className="tasks-hub__kpi-value">{wf?.pending ?? 0}</div>
          </div>
          <div className="tasks-hub__kpi-card tasks-hub__kpi-card--danger">
            <div className="tasks-hub__kpi-label">逾期</div>
            <div className="tasks-hub__kpi-value">{wf?.overdueCount ?? 0}</div>
          </div>
          <div className="tasks-hub__kpi-card">
            <div className="tasks-hub__kpi-label">活跃 Agent（任务中）</div>
            <div className="tasks-hub__kpi-value">{qSummary.data.agents.activeInTasks}</div>
          </div>
        </div>
      ) : null}

      <div className="tasks-hub__toolbar">
        <div className="tasks-hub__chips" role="tablist" aria-label="范围">
          <button
            type="button"
            role="tab"
            className={`module-chip${scope.kind === 'company' ? ' active' : ''}`}
            onClick={onScopeCompany}
          >
            公司级 ({qRootTotal.isLoading ? '…' : (qRootTotal.data ?? 0)})
          </button>
          {departments.map((d) => {
            const c = deptActiveCount(load, d.id);
            const active = scope.kind === 'department' && scope.nodeId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                className={`module-chip${active ? ' active' : ''}`}
                onClick={() => onScopeDept(d)}
              >
                {d.name} ({c})
              </button>
            );
          })}
        </div>
        <Select
          className="tasks-hub__status-select"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={onStatusChange}
          popupMatchSelectWidth={false}
        />
      </div>

      <section className="panel tasks-hub__panel">
        <div className="tasks-hub__panel-head">
          <span className="panel-title" style={{ marginBottom: 0 }}>
            任务列表
            {scope.kind === 'department' ? (
              <span className="tasks-hub__scope-hint"> · {scope.name}</span>
            ) : null}
          </span>
          {qTasks.isFetching && !qTasks.isLoading ? <Tag color="processing">刷新中</Tag> : null}
        </div>

        {loadingCore ? (
          <div className="tasks-hub__loading">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无符合条件的根任务"
            className="tasks-hub__empty"
          />
        ) : (
          <>
            <ul className="tasks-hub__list">
              {items.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
            {total > PAGE_SIZE ? (
              <div className="tasks-hub__pager">
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  showSizeChanger={false}
                  onChange={(p) => setPage(p)}
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      <Modal
        title="输入大目标"
        open={goalOpen}
        onCancel={() => {
          setGoalOpen(false);
          setGoalText('');
        }}
        onOk={() => {
          const g = goalText.trim();
          if (!g) {
            message.warning('请描述目标');
            return;
          }
          breakdownMut.mutate(g);
        }}
        confirmLoading={breakdownMut.isPending}
        destroyOnClose
      >
        <p className="tasks-hub__modal-hint">系统将拆解为子任务并写入任务树（耗时可能达数十秒）。</p>
        <Input.TextArea
          rows={4}
          placeholder="例如：本季度完成核心客户的交付与续约材料"
          value={goalText}
          onChange={(e) => {
            const t = e.target as unknown as { value: string };
            setGoalText(t.value);
          }}
          maxLength={2000}
          showCount
        />
      </Modal>
    </div>
  );
};

function TaskRow({ task }: { task: TaskEntity }) {
  const meta = taskRiskMeta(task);
  const pct = Math.min(100, Math.max(0, meta.pct));
  const pr = priorityLabel(task.priority);

  return (
    <li className="tasks-hub__row">
      <span className="task-dot" style={{ background: meta.dotColor }} aria-hidden />
      <div className="tasks-hub__row-main">
        <div className="tasks-hub__row-title">
          <span className="task-name">{task.title || task.id}</span>
          <Tag>{statusLabel(task.status)}</Tag>
          {pr ? <Tag color="orange">{pr}</Tag> : null}
        </div>
        <div className="tasks-hub__row-meta">
          {formatDue(task.dueDate)}
          {task.blockedReason ? (
            <span className="tasks-hub__blocked"> · {task.blockedReason}</span>
          ) : null}
        </div>
      </div>
      <div className="tasks-hub__row-progress">
        <span className="task-pct">{pct}%</span>
        <div className="progress-bar" style={{ width: 72, marginTop: 4 }}>
          <div className="progress-fill" style={{ width: `${pct}%`, background: meta.dotColor }} />
        </div>
      </div>
      <span
        className={`task-risk ${meta.className}`}
        style={
          meta.className
            ? undefined
            : { background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }
        }
      >
        {meta.label}
      </span>
    </li>
  );
}
