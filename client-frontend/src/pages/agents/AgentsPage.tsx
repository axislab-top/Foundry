import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, Spin } from 'antd';
import { useCompany } from '../../contexts/CompanyContext';
import {
  collectDepartmentNodes,
  nodesByIdFromRoots,
  resolveAncestorDepartment,
} from '../../lib/organizationTree';
import { getOrganizationTree } from '../../services/organizationApi';
import { listAgents, type Agent, type AgentRole } from '../../services/agentsApi';
import { getBillingSummary } from '../../services/dashboardApi';
import type { BillingDashboardSummary } from '../../services/dashboardTypes';
import { listMarketplaceAgents, type MarketplaceAgentItem } from '../../services/marketplaceApi';

const AVATAR_BG = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#A855F7', '#EC4899'];

const ROLE_CHIPS: Array<{ key: 'all' | AgentRole; label: string; role?: AgentRole }> = [
  { key: 'all', label: '全部 Agent' },
  { key: 'ceo', label: 'CEO', role: 'ceo' },
  { key: 'director', label: '总监', role: 'director' },
  { key: 'board_member', label: '董事', role: 'board_member' },
  { key: 'executor', label: '执行', role: 'executor' },
];

function roleLabel(role: string | undefined): string {
  const m: Record<string, string> = {
    ceo: 'CEO',
    director: '总监',
    board_member: '董事',
    executor: '执行',
  };
  return m[role ?? ''] ?? role ?? '—';
}

function statusClass(s: string | undefined): string {
  if (s === 'suspended') {
    return 'status-busy';
  }
  if (s === 'inactive') {
    return 'status-idle';
  }
  return 'status-active';
}

function statusLabel(s: string | undefined): string {
  if (s === 'inactive') {
    return '未激活';
  }
  if (s === 'suspended') {
    return '已暂停';
  }
  return '活跃';
}

function initials(name: string | undefined): string {
  const t = (name || '?').trim();
  return t.length <= 2 ? t.toUpperCase() : t.slice(0, 2).toUpperCase();
}

function avatarColor(i: number): string {
  return AVATAR_BG[i % AVATAR_BG.length];
}

function sortAgentsForDepartment(a: Agent, b: Agent): number {
  const rank = (r: string | undefined) => (r === 'director' ? 0 : r === 'ceo' ? 1 : 2);
  const d = rank(a.role as string | undefined) - rank(b.role as string | undefined);
  if (d !== 0) {
    return d;
  }
  return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
}

function costForAgent(billing: BillingDashboardSummary | undefined, agentId: string): string | null {
  const row = billing?.topAgents?.find((x) => x.id === agentId);
  if (!row) {
    return null;
  }
  const n = parseFloat(row.cost);
  if (Number.isNaN(n)) {
    return row.cost;
  }
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toFixed(0);
}

export const AgentsPage: React.FC = () => {
  const { companyId, isLoading: companiesLoading } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;
  const [chip, setChip] = useState<(typeof ROLE_CHIPS)[number]>(ROLE_CHIPS[0]);
  const [marketOpen, setMarketOpen] = useState(false);

  const q = useQuery({
    queryKey: ['agents', 'list', companyId, chip.key],
    queryFn: () =>
      listAgents({
        page: 1,
        pageSize: 60,
        ...(chip.role ? { role: chip.role } : {}),
      }),
    enabled: tenantReady,
  });

  const qBilling = useQuery({
    queryKey: ['dashboard', 'billing', companyId, 'agents-page'],
    queryFn: getBillingSummary,
    enabled: tenantReady,
  });

  const mq = useQuery({
    queryKey: ['marketplace', 'agents', marketOpen],
    queryFn: () => listMarketplaceAgents({ page: 1, pageSize: 40 }),
    enabled: tenantReady && marketOpen,
  });

  const treeQ = useQuery({
    queryKey: ['organization', 'tree', companyId],
    queryFn: getOrganizationTree,
    enabled: tenantReady,
  });

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'));
  }, [items]);

  const deptSections = useMemo(() => {
    const roots = treeQ.data ?? [];
    const depts = collectDepartmentNodes(roots);
    if (depts.length === 0) {
      return null;
    }
    const nodesById = nodesByIdFromRoots(roots);
    type Sec = { key: string; title: string; agents: Agent[] };
    const sections: Sec[] = [];
    for (const d of depts) {
      const agents = sortedItems
        .filter((a) => resolveAncestorDepartment(a.organizationNodeId ?? null, nodesById)?.id === d.id)
        .sort(sortAgentsForDepartment);
      if (agents.length > 0) {
        sections.push({ key: d.id, title: d.name, agents });
      }
    }
    const unassigned = sortedItems
      .filter((a) => !resolveAncestorDepartment(a.organizationNodeId ?? null, nodesById))
      .sort(sortAgentsForDepartment);
    if (unassigned.length > 0) {
      sections.push({ key: '_unassigned', title: '未归属部门', agents: unassigned });
    }
    return sections;
  }, [sortedItems, treeQ.data]);

  return (
    <div className="content-area">
      <div className="page-header">
        <div className="page-title">Agent 管理</div>
        <div className="quick-actions">
          <button type="button" className="qa-btn" onClick={() => setMarketOpen(true)}>
            浏览 Agent 商城
          </button>
          <button type="button" className="qa-btn primary" onClick={() => setMarketOpen(true)}>
            + 招聘 Agent
          </button>
        </div>
      </div>

      {!tenantReady && !companiesLoading ? (
        <Alert type="warning" message="请先选择公司后再查看 Agent。" showIcon />
      ) : null}
      {q.error ? <Alert type="error" message={(q.error as Error).message} showIcon /> : null}
      {treeQ.error ? <Alert type="error" message={(treeQ.error as Error).message} showIcon /> : null}

      <div className="module-tabs">
        {ROLE_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`module-chip${chip.key === c.key ? ' active' : ''}`}
            onClick={() => setChip(c)}
          >
            {c.key === 'all' ? `全部 Agent (${total})` : `${c.label} (${total})`}
          </button>
        ))}
      </div>

      {tenantReady && q.isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : null}

      {tenantReady && !q.isLoading && sortedItems.length === 0 ? (
        <div className="panel">
          <p className="orgos-muted" style={{ margin: 0 }}>
            暂无 Agent。打开商城可浏览上架模板；创建后将在列表中显示。
          </p>
        </div>
      ) : null}

      {tenantReady && !q.isLoading && sortedItems.length > 0 ? (
        <>
          {deptSections && deptSections.length > 0 ? (
            <>
              {deptSections.map((sec, si) => (
                <section key={sec.key} className="agents-dept-section">
                  <header className="agents-dept-section__head">
                    <h2 className="agents-dept-section__title">{sec.title}</h2>
                    <span className="agents-dept-section__meta">
                      {sec.key === '_unassigned'
                        ? '组织树上未挂到部门节点'
                        : `${sec.agents.filter((a) => a.role === 'director').length ? '含部门主管 · ' : ''}${sec.agents.length} 个 Agent`}
                    </span>
                  </header>
                  <div className="agents-dept-section__grid">
                    {sec.agents.map((a, idx) => (
                      <AgentCard
                        key={a.id}
                        agent={a}
                        index={si * 17 + idx}
                        billing={qBilling.data}
                        highlightDirector={sec.key !== '_unassigned'}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {sortedItems.map((a, idx) => (
                <AgentCard key={a.id} agent={a} index={idx} billing={qBilling.data} />
              ))}
            </div>
          )}
          <div
            className="panel"
            style={{
              cursor: 'pointer',
              borderStyle: 'dashed',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 160,
              marginTop: deptSections && deptSections.length > 0 ? 8 : 0,
            }}
            onClick={() => setMarketOpen(true)}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1.5px dashed var(--color-border-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 20,
              }}
            >
              +
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>招聘新 Agent</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>从商城选择模板</div>
          </div>
        </>
      ) : null}

      <Modal
        title="Agent 商城（上架模板）"
        open={marketOpen}
        onCancel={() => setMarketOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {mq.isLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : mq.error ? (
          <Alert type="error" message={(mq.error as Error).message} showIcon />
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(mq.data?.items ?? []).length === 0 ? (
              <p className="orgos-muted" style={{ margin: 0 }}>暂无上架商品。</p>
            ) : (
              (mq.data?.items ?? []).map((m) => <MarketplaceRow key={m.id} item={m} />)
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const AgentCard: React.FC<{
  agent: Agent;
  index: number;
  billing: BillingDashboardSummary | undefined;
  /** 在部门分组内为 `director` 角色显示「部门主管」徽标 */
  highlightDirector?: boolean;
}> = ({ agent: a, index, billing, highlightDirector }) => {
  const cost = costForAgent(billing, a.id);
  const model = a.llmModel || '未配置模型';
  const isDirector = a.role === 'director';
  return (
    <div
      className="panel"
      style={{
        cursor: 'default',
        boxShadow: highlightDirector && isDirector ? '0 0 0 1px rgba(34, 197, 94, 0.35)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="agent-avatar" style={{ background: avatarColor(index), width: 40, height: 40, fontSize: 14 }}>
          {initials(a.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{a.name || a.id}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {highlightDirector && isDirector ? '部门主管 · ' : ''}
            {roleLabel(a.role)}
          </div>
        </div>
        <span className={`agent-status ${statusClass(a.status)}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {statusLabel(a.status)}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          marginBottom: 10,
          lineHeight: 1.5,
          minHeight: 36,
        }}
      >
        {a.expertise?.trim() || '暂无职责描述'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="module-chip active" style={{ fontSize: 11 }}>
          {roleLabel(a.role)}
        </span>
        {a.humanInLoop ? (
          <span className="module-chip" style={{ fontSize: 11 }}>
            HITL
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model}</span>
        <span style={{ flexShrink: 0, marginLeft: 8 }}>{cost != null ? `本月消耗 ${cost}` : '计费 —'}</span>
      </div>
    </div>
  );
};

const MarketplaceRow: React.FC<{ item: MarketplaceAgentItem }> = ({ item }) => (
  <div
    style={{
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 'var(--border-radius-md)',
      padding: '10px 12px',
      background: 'var(--color-background-secondary)',
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.name}</div>
    {item.expertise ? (
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{item.expertise}</div>
    ) : null}
    {item.description ? (
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>
        {String(item.description).slice(0, 200)}
        {String(item.description).length > 200 ? '…' : ''}
      </div>
    ) : null}
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
      {item.boundModelName ? `模型 ${item.boundModelName}` : ''}
      {item.usageCount != null ? `${item.boundModelName ? ' · ' : ''}使用 ${item.usageCount} 次` : ''}
    </div>
  </div>
);
