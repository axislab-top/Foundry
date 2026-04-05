import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Spin, Tag } from 'antd';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  HistoryOutlined,
  LockOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../contexts/CompanyContext';
import { collectSubtreeOrganizationNodeIds } from '../../lib/organizationTree';
import { listAgents } from '../../services/agentsApi';
import { getOrganizationTree, type OrganizationTreeNode } from '../../services/organizationApi';
import { OrganizationChartSvg } from './OrganizationChartSvg';
import { NODE_TYPE_STYLE, typeLabel } from './organizationLayout';
import './organization-page.css';

const LEGEND_ORDER = ['board', 'ceo', 'department', 'agent'] as const;

function TreeOutline({
  nodes,
  depth = 0,
  selectedId,
  onSelect,
}: {
  nodes: OrganizationTreeNode[];
  depth?: number;
  selectedId: string | null;
  onSelect: (n: OrganizationTreeNode) => void;
}) {
  return (
    <ul className="org-outline">
      {nodes.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={`org-outline__row${selectedId === n.id ? ' org-outline__row--selected' : ''}`}
            onClick={() => onSelect(n)}
          >
            <span className="org-outline__name">{n.name}</span>
            <span className="org-outline__type">{typeLabel(n.type)}</span>
          </button>
          {n.children?.length ? (
            <TreeOutline
              nodes={n.children}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export const OrganizationPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyId, isLoading: companiesLoading, companies } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;
  const [selected, setSelected] = useState<OrganizationTreeNode | null>(null);

  const q = useQuery({
    queryKey: ['organization', 'tree', companyId],
    queryFn: getOrganizationTree,
    enabled: tenantReady,
  });

  const qAgents = useQuery({
    queryKey: ['agents', 'organization-page', companyId],
    queryFn: () => listAgents({ page: 1, pageSize: 200 }),
    enabled: tenantReady,
  });

  const roots = q.data ?? [];

  const departmentAgentBreakdown = useMemo(() => {
    if (!selected || selected.type !== 'department') {
      return null;
    }
    const slotIds = collectSubtreeOrganizationNodeIds(selected);
    const agents = (qAgents.data?.items ?? []).filter(
      (a) => a.organizationNodeId && slotIds.has(a.organizationNodeId),
    );
    const heads = agents.filter((a) => a.role === 'director');
    const members = agents.filter((a) => a.role !== 'director');
    return { heads, members, childNodes: selected.children ?? [] };
  }, [selected, qAgents.data?.items]);
  const showNoCompany = !companiesLoading && companies.length === 0;

  return (
    <div className="content-area content-area--flush org-page">
      <header className="org-page__header">
        <div className="org-page__header-card">
          <div className="org-page__header-main">
            <div className="org-page__header-icon" aria-hidden>
              <ApartmentOutlined />
            </div>
            <div className="org-page__header-text">
              <div className="org-page__eyebrow">公司与组织</div>
              <div className="org-page__title-row">
                <h1 className="org-page__title">组织结构</h1>
                <Tag icon={<LockOutlined />} className="org-page__status-tag">
                  只读视图
                </Tag>
              </div>
              <p className="org-page__lede">
                在画布中浏览层级关系；右侧可查看节点属性与全文大纲。编辑、模板应用与保存将在能力接入后开放。
              </p>
            </div>
          </div>
          <div className="org-page__header-actions">
            <Space wrap size="middle">
              <Button icon={<AppstoreOutlined />} disabled title="需后端模板 API">
                应用模板
              </Button>
              <Button icon={<HistoryOutlined />} onClick={() => navigate('/audit')}>
                变更历史
              </Button>
              <Button type="primary" icon={<SaveOutlined />} disabled title="节点编辑接入后可保存">
                保存变更
              </Button>
            </Space>
          </div>
        </div>
      </header>

      <div className="org-page__alerts">
        {showNoCompany ? (
          <Alert type="warning" message="请先选择或创建公司后再查看组织结构。" showIcon />
        ) : null}
        {q.error ? <Alert type="error" message={(q.error as Error).message} showIcon /> : null}
      </div>

      {tenantReady && q.isLoading ? (
        <div className="org-page__loading">
          <Spin size="large" tip="加载组织树…" />
        </div>
      ) : null}

      {tenantReady && !q.isLoading && roots.length === 0 ? (
        <div className="panel org-page__empty-hint">
          <p className="orgos-muted" style={{ margin: 0 }}>
            暂无组织节点。创建公司并初始化组织后，将在此显示层级结构。
          </p>
        </div>
      ) : null}

      {tenantReady && !q.isLoading && roots.length > 0 ? (
        <div className="org-page__grid">
          <section className="org-page__canvas" aria-label="组织画布">
            <div className="org-page__canvas-head">
              <h2 className="org-page__canvas-title">组织画布</h2>
              <span className="org-page__canvas-meta">同步自组织服务</span>
            </div>
            <OrganizationChartSvg roots={roots} selectedId={selected?.id ?? null} onSelect={setSelected} />
            <div className="org-page__legend" aria-hidden>
              {LEGEND_ORDER.map((key) => {
                const st = NODE_TYPE_STYLE[key];
                return (
                  <span key={key} className="org-page__legend-item">
                    <span
                      className="org-page__legend-swatch"
                      style={{ background: st.fill, borderColor: st.stroke }}
                    />
                    {typeLabel(key)}
                  </span>
                );
              })}
            </div>
          </section>

          <aside className="org-page__side" aria-label="节点与大纲">
            <div className="org-page__side-card org-page__side-card--detail">
              <div className="org-page__side-title">节点详情</div>
              {selected ? (
                <div className="org-page__detail-rows">
                  <div>
                    <div className="org-page__detail-row-label">名称</div>
                    <div className="org-page__detail-row-value">{selected.name}</div>
                  </div>
                  <div>
                    <div className="org-page__detail-row-label">类型</div>
                    <div className="org-page__detail-row-value org-page__detail-row-value--secondary">
                      <Tag color="blue" style={{ marginInlineEnd: 8 }}>
                        {typeLabel(selected.type)}
                      </Tag>
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{selected.type}</span>
                    </div>
                  </div>
                  {selected.description ? (
                    <div>
                      <div className="org-page__detail-row-label">描述</div>
                      <div className="org-page__detail-row-value org-page__detail-row-value--secondary">
                        {selected.description}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="org-page__detail-row-label">节点 ID</div>
                    <div className="org-page__detail-row-value org-page__detail-row-value--mono">{selected.id}</div>
                  </div>
                  {selected.agentId ? (
                    <div>
                      <div className="org-page__detail-row-label">绑定 Agent</div>
                      <div className="org-page__detail-row-value org-page__detail-row-value--mono">
                        {selected.agentId}
                      </div>
                    </div>
                  ) : null}
                  {selected.type === 'department' && departmentAgentBreakdown ? (
                    <>
                      <div>
                        <div className="org-page__detail-row-label">部门主管（总监）</div>
                        <div className="org-page__detail-row-value org-page__detail-row-value--secondary">
                          {qAgents.isLoading ? (
                            <span style={{ fontSize: 12 }}>加载 Agent 列表…</span>
                          ) : departmentAgentBreakdown.heads.length === 0 ? (
                            <span style={{ fontSize: 12 }}>暂无「总监」角色 Agent，可在招聘流程中配置部门主管。</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                              {departmentAgentBreakdown.heads.map((a) => (
                                <li key={a.id}>{a.name ?? a.id}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="org-page__detail-row-label">部门成员与其它 Agent</div>
                        <div className="org-page__detail-row-value org-page__detail-row-value--secondary">
                          {qAgents.isLoading ? (
                            <span style={{ fontSize: 12 }}>加载中…</span>
                          ) : departmentAgentBreakdown.members.length === 0 ? (
                            <span style={{ fontSize: 12 }}>暂无执行类或其它角色 Agent。</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                              {departmentAgentBreakdown.members.map((a) => (
                                <li key={a.id}>
                                  {a.name ?? a.id}
                                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, marginLeft: 6 }}>
                                    {a.role === 'executor'
                                      ? '执行'
                                      : a.role === 'ceo'
                                        ? 'CEO'
                                        : a.role === 'board_member'
                                          ? '董事'
                                          : String(a.role ?? '')}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="org-page__detail-row-label">直属组织节点</div>
                        <div className="org-page__detail-row-value org-page__detail-row-value--secondary">
                          {departmentAgentBreakdown.childNodes.length === 0 ? (
                            <span style={{ fontSize: 12 }}>暂无子节点，可在组织服务接入编辑后扩展岗位。</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                              {departmentAgentBreakdown.childNodes.map((c) => (
                                <li key={c.id}>
                                  {c.name}{' '}
                                  <Tag color="blue" style={{ marginInlineStart: 6, fontSize: 11 }}>
                                    {typeLabel(c.type)}
                                  </Tag>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                      点击画布或下方大纲中的节点
                    </span>
                  }
                />
              )}
            </div>

            <div className="org-page__side-card org-page__side-card--outline">
              <div className="org-page__side-title">
                <BranchesOutlined style={{ marginRight: 6 }} aria-hidden />
                结构大纲
              </div>
              <div className="org-page__outline-scroll">
                <TreeOutline nodes={roots} selectedId={selected?.id ?? null} onSelect={setSelected} />
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
};
