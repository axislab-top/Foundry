import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2, Download, Eye, Grid, List, Power, Search } from 'lucide-react';
import { ApiError } from '../../services/apiClient';
import { companiesApi, type AiCompanySummary, type AiCompanyStatus } from '../../services/companiesApi';
import { dashboardApi, type BillingSummary, type CompanySummary, type PaginatedResult } from '../../services/dashboardApi';

type ViewMode = 'table' | 'card';

interface CompaniesFilterState {
  q: string;
  status: '' | AiCompanyStatus;
}

function statusBadge(status: AiCompanyStatus): { label: string; className: string } {
  if (status === 'active') return { label: '运行中', className: 'badge badge-green' };
  if (status === 'suspended') return { label: '暂停', className: 'badge badge-gray' };
  if (status === 'archived') return { label: '归档', className: 'badge badge-gray' };
  return { label: '草稿', className: 'badge badge-gray' };
}

function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    const safe = s.replace(/"/g, '""');
    return `"${safe}"`;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const CompaniesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>((searchParams.get('view') as ViewMode | null) || 'table');
  const [filters, setFilters] = useState<CompaniesFilterState>({
    q: searchParams.get('q') || '',
    status: (searchParams.get('status') as AiCompanyStatus | null) || '',
  });

  const [page, setPage] = useState<number>(Number(searchParams.get('page') || 1));
  const pageSize = 10;

  const [list, setList] = useState<PaginatedResult<AiCompanySummary> | null>(null);
  const [summaries, setSummaries] = useState<Record<string, CompanySummary>>({});
  const [billing, setBilling] = useState<Record<string, BillingSummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filters.q) next.set('q', filters.q);
    else next.delete('q');
    if (filters.status) next.set('status', filters.status);
    else next.delete('status');
    next.set('page', String(page));
    next.set('view', viewMode);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, page, viewMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await companiesApi.list({
          page,
          pageSize,
          search: filters.q.trim() || undefined,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        });
        if (cancelled) return;
        setList(res);

        const ids = (res.items || []).map((c) => c.id).filter(Boolean);
        if (!ids.length) {
          setSummaries({});
          setBilling({});
          return;
        }
        const pairs = await Promise.all(
          ids.map(async (id) => {
            const [s, b] = await Promise.all([
              dashboardApi.fetchCompanySummary(id),
              dashboardApi.fetchCompanyBillingSummary(id),
            ]);
            return { id, summary: s, billing: b };
          }),
        );
        if (cancelled) return;
        setSummaries(Object.fromEntries(pairs.map((p) => [p.id, p.summary])));
        setBilling(Object.fromEntries(pairs.map((p) => [p.id, p.billing])));
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load companies';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [filters.q, page]);

  const handleFilterChange = (patch: Partial<CompaniesFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const items = useMemo(() => {
    const raw = list?.items ?? [];
    if (!filters.status) return raw;
    return raw.filter((c) => c.status === filters.status);
  }, [filters.status, list]);

  const itemsWithStats = useMemo(() => {
    return items.map((c) => ({
      company: c,
      summary: summaries[c.id],
      billing: billing[c.id],
    }));
  }, [billing, items, summaries]);

  const onRowClick = (id: string) => {
    navigate(`/companies/${id}`);
  };

  const onExportCsv = () => {
    const rows = itemsWithStats.map(({ company, summary, billing: bill }) => {
      const budgetUtil = bill?.budget?.utilization ?? null;
      const budgetPct = budgetUtil == null ? null : Math.round(budgetUtil * 100);
      const activeTasks = summary ? summary.activeWorkflow.inProgress + summary.activeWorkflow.pending : null;
      const agents = summary ? `${summary.agents.activeInTasks}/${summary.agents.totalActive}` : null;
      const lastActive = summary?.generatedAt ? new Date(summary.generatedAt).toISOString() : null;
      return {
        companyId: company.id,
        name: company.name,
        slug: company.slug ?? '',
        industry: company.industry ?? '',
        status: company.status,
        budgetUtilizationPct: budgetPct,
        activeTasks,
        agents,
        lastActive,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      };
    });
    downloadCsv(`companies-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="dash-page dash-page--v2">
      <section className="dash-hero">
        <div className="dash-title-row">
          <div>
            <h2 className="dash-title-v2">
              <Building2 size={20} className="dash-title-icon" />
              公司主体管理
            </h2>
            <div className="dash-subtitle">管理端仅支持查询与治理；公司主体由客户端注册/入驻流程产生。</div>
          </div>
          <div className="dash-hero-actions">
            <button className="btn btn-small" type="button" onClick={onExportCsv} disabled={!itemsWithStats.length}>
              <Download size={14} /> 导出 CSV
            </button>
          </div>
        </div>

        <div className="dash-monitor-head">
          <div className="dash-monitor-title">
            <h3>Companies</h3>
            <span className="badge badge-gray">{itemsWithStats.length}</span>
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

        <div className="dash-html-company-panel">
          <div className="dash-monitor-search">
            <div className="filter-row">
              <div className="field" style={{ minWidth: 260 }}>
                <label>
                  <Search size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} /> 搜索
                </label>
                <input
                  value={filters.q}
                  onChange={(e) => handleFilterChange({ q: e.target.value })}
                  placeholder="公司名称 / ID / 所属用户（邮箱/手机号/用户ID）"
                />
              </div>
              <div className="field" style={{ minWidth: 180 }}>
                <label>状态</label>
                <select value={filters.status} onChange={(e) => handleFilterChange({ status: (e.target.value as AiCompanyStatus) || '' })}>
                  <option value="">全部</option>
                  <option value="active">运行中</option>
                  <option value="suspended">暂停</option>
                  <option value="archived">归档</option>
                  <option value="draft">草稿</option>
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="error-box">
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
              {error}
            </div>
          ) : null}

          {!list && loading ? <div className="card">Loading companies...</div> : null}
          {list && itemsWithStats.length === 0 && !loading ? <div className="card">暂无公司。</div> : null}

          {list && itemsWithStats.length > 0 ? (
            viewMode === 'card' ? (
              <div className="dash-html-company-grid">
                {itemsWithStats.map(({ company, summary, billing: bill }) => {
                  const budgetPct = clampPct(Math.round((bill?.budget?.utilization ?? 0) * 100));
                  const budgetColor =
                    budgetPct > 90 ? 'var(--dash-rose)' : budgetPct > 70 ? 'var(--dash-orange)' : 'var(--dash-emerald)';
                  const status = statusBadge(company.status);
                  const pending = summary?.activeWorkflow.pending ?? 0;
                  const inProgress = summary?.activeWorkflow.inProgress ?? 0;
                  return (
                    <div key={company.id} className="dash-html-company-card">
                      <div className="dash-html-company-head">
                        <div>
                          <div className="dash-html-company-name">{company.name}</div>
                          <div className="dash-html-company-sub">
                            ID: <span className="dash-html-mono">{company.id}</span> · slug: {company.slug || '-'} · {company.industry || '-'}
                          </div>
                        </div>
                        <span className={status.className}>{status.label}</span>
                      </div>

                      <div className="dash-html-company-split">
                        <div>
                          <div className="dash-html-micro-title">任务状态</div>
                          <div className="dash-html-task-pair">
                            <div className="dash-html-task-item">
                              <div className="dash-html-task-val">{pending}</div>
                              <div className="dash-html-task-label">待处理</div>
                            </div>
                            <div className="dash-html-task-item">
                              <div className="dash-html-task-val">{inProgress}</div>
                              <div className="dash-html-task-label">运行中</div>
                            </div>
                          </div>
                        </div>

                        <div className="dash-html-company-budget">
                          <div className="dash-html-micro-title">预算使用</div>
                          <div className="dash-html-budget-track">
                            <div className="dash-html-budget-bar" style={{ width: `${budgetPct}%`, background: budgetColor }} />
                          </div>
                          <div className="dash-html-budget-foot">{budgetPct}%</div>
                        </div>
                      </div>

                      <div className="dash-html-company-foot">
                        <button className="dash-html-soft" type="button" onClick={() => onRowClick(company.id)}>
                          详情
                        </button>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="dash-html-more" type="button" aria-label="View" onClick={() => onRowClick(company.id)}>
                            <Eye size={16} />
                          </button>
                          <button className="dash-html-more" type="button" aria-label="Disable" onClick={(e) => e.preventDefault()}>
                            <Power size={16} />
                          </button>
                        </div>
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
                      <th>最后活跃</th>
                      <th style={{ textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsWithStats.map(({ company, summary, billing: bill }) => {
                      const budgetPct = clampPct(Math.round((bill?.budget?.utilization ?? 0) * 100));
                      const status = statusBadge(company.status);
                      const pending = summary?.activeWorkflow.pending ?? 0;
                      const inProgress = summary?.activeWorkflow.inProgress ?? 0;
                      const lastActive = summary?.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '-';
                      return (
                        <tr key={company.id}>
                          <td>
                            <div className="dash-html-table-name">{company.name}</div>
                            <div className="dash-html-table-sub">
                              <span className="dash-html-mono">{company.id}</span> · {company.industry || '-'}
                            </div>
                          </td>
                          <td>
                            <span className={status.className}>{status.label}</span>
                          </td>
                          <td>
                            <div className="dash-html-budget-track dash-html-budget-track--table">
                              <div className="dash-html-budget-bar" style={{ width: `${budgetPct}%`, background: 'var(--dash-blue)' }} />
                            </div>
                          </td>
                          <td className="dash-html-mono">
                            {pending} / {inProgress}
                          </td>
                          <td className="dash-html-mono">{lastActive}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="dash-html-link" type="button" onClick={() => onRowClick(company.id)}>
                              查看
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {list ? (
            <div className="pagination">
              <button className="btn btn-small" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <div className="pagination-info">
                Page {list.page} / {list.totalPages || 1}
              </div>
              <button
                className="btn btn-small"
                type="button"
                disabled={page >= (list.totalPages || 1)}
                onClick={() => setPage((p) => Math.min(list.totalPages || p, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

