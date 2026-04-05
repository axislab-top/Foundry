import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, ChevronRight, Clock, CreditCard, Edit3, Power, ShieldCheck, Users } from 'lucide-react';
import { companiesApi, type AiCompanyDetail, type AiCompanyStatus } from '../../services/companiesApi';
import { dashboardApi, type BillingSummary, type CompanySummary } from '../../services/dashboardApi';
import { ApiError } from '../../services/apiClient';
import { BoardRoomTab } from './BoardRoomTab';

type DetailTabId = 'profile' | 'members' | 'billing' | 'kyc' | 'audit' | 'board';

function statusLabel(status: AiCompanyStatus): string {
  if (status === 'active') return '运行中';
  if (status === 'suspended') return '已停用';
  if (status === 'archived') return '归档';
  return '草稿';
}

function formatMono(v: string | null | undefined): React.ReactNode {
  if (!v) return '-';
  return <code className="dash-html-mono">{v}</code>;
}

function useCompanyDetail(companyId: string | undefined) {
  const [company, setCompany] = useState<AiCompanyDetail | null>(null);
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, s, b] = await Promise.all([
          companiesApi.get(companyId),
          dashboardApi.fetchCompanySummary(companyId),
          dashboardApi.fetchCompanyBillingSummary(companyId),
        ]);
        if (cancelled) return;
        setCompany(c);
        setSummary(s);
        setBilling(b);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load company';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { company, summary, billing, loading, error, setCompany };
}

export const CompanyDetailPage: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as DetailTabId | null) || 'profile';

  const { company, summary, billing, loading, error, setCompany } = useCompanyDetail(companyId);

  const stats = useMemo(
    () => ({ plan: '-', expire: '-', members: '-', auth: '-' }),
    [],
  );
  const budgetUtil = billing?.budget?.utilization ?? null;
  const lastSnapshot = summary?.generatedAt
    ? new Date(summary.generatedAt).toLocaleString()
    : '-';

  const onChangeTab = (tab: DetailTabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const onStatusChange = async (status: AiCompanyDetail['status']) => {
    if (!companyId) return;
    const reason = window.prompt('请输入状态变更原因（可选）') || undefined;
    try {
      const updated = await companiesApi.changeStatus(companyId, status, reason);
      setCompany(updated);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to change status';
      // eslint-disable-next-line no-alert
      alert(msg);
    }
  };

  if (!companyId) {
    return <div className="card">无效的公司 ID。</div>;
  }

  if (loading && !company) {
    return <div className="card">Loading company...</div>;
  }

  if (error) {
    return <div className="card error-box">{error}</div>;
  }

  if (!company) {
    return <div className="card">公司不存在或不可见。</div>;
  }

  return (
    <div className="companies-detail-v2">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(100, 116, 139, 1)', fontSize: 12, marginBottom: 16 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => navigate('/companies')}>
          Admin System
        </span>
        <ChevronRight size={14} />
        <span style={{ cursor: 'pointer' }} onClick={() => navigate('/companies')}>
          Companies
        </span>
        <ChevronRight size={14} />
        <span style={{ color: 'rgba(15, 23, 42, 1)', fontWeight: 800 }}>主体详情</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-small" type="button" onClick={() => navigate('/companies')} aria-label="Back">
            <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="dash-title-v2" style={{ margin: 0 }}>
                <Building2 size={20} className="dash-title-icon" />
                {company.name}
              </h2>
              <span className={company.status === 'active' ? 'badge badge-green' : 'badge badge-gray'}>{statusLabel(company.status)}</span>
            </div>
            <div className="dash-subtitle">
              Company ID: {formatMono(company.id)} · slug: {company.slug || '-'} · {company.industry || '-'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-small" type="button" onClick={() => alert('TODO: edit basic info')}>
            <Edit3 size={14} /> 编辑
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => onStatusChange(company.status === 'active' ? 'suspended' : 'active')}
          >
            <Power size={14} /> {company.status === 'active' ? '停用该主体' : '恢复该主体'}
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">
            <CreditCard size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom', color: 'var(--dash-blue)' }} />
            当前套餐
          </div>
          <div className="stat-value">{stats.plan}</div>
          <div className="dash-muted" style={{ marginTop: 6, fontSize: 12 }}>
            到期: {stats.expire}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <Users size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom', color: 'var(--dash-indigo)' }} />
            成员数
          </div>
          <div className="stat-value">{stats.members}</div>
          <div className="dash-muted" style={{ marginTop: 6, fontSize: 12 }}>
            所属用户: {company.createdBy ? formatMono(company.createdBy) : '-'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom', color: 'var(--dash-emerald)' }} />
            认证状态
          </div>
          <div className="stat-value">{stats.auth}</div>
          <div className="dash-muted" style={{ marginTop: 6, fontSize: 12 }}>
            最近快照: {lastSnapshot}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <Clock size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom', color: 'var(--dash-slate-600)' }} />
            预算使用率
          </div>
          <div className="stat-value">{budgetUtil == null ? '-' : `${Math.round(budgetUtil * 100)}%`}</div>
          <div className="dash-muted" style={{ marginTop: 6, fontSize: 12 }}>
            创建: {new Date(company.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="dash-html-company-panel" style={{ padding: 0 }}>
        <div className="tabs" style={{ borderBottom: '1px solid rgba(241, 245, 249, 1)' }}>
          {[
            ['profile', '概览资料'],
            ['board', '董事会视图'],
            ['members', '成员管理'],
            ['billing', '订阅计费'],
            ['kyc', '认证资料'],
            ['audit', '审计日志'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={id === activeTab ? 'tab-item tab-item--active' : 'tab-item'}
              onClick={() => onChangeTab(id as DetailTabId)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {activeTab === 'profile' ? <ProfileTab company={company} /> : null}
          {activeTab === 'board' ? <BoardRoomTab companyId={company.id} /> : null}
          {activeTab === 'members' ? <MembersTab company={company} /> : null}
          {activeTab === 'billing' ? <BillingTab billing={billing} /> : null}
          {activeTab === 'kyc' ? <KycTab company={company} /> : null}
          {activeTab === 'audit' ? <AuditTab companyId={company.id} /> : null}
        </div>
      </div>
    </div>
  );
};

const ProfileTab: React.FC<{ company: AiCompanyDetail }> = ({ company }) => {
  return (
    <div className="card">
      <h3 className="section-title">公司基础资料</h3>
      <div className="detail-grid">
        <div>
          <div className="detail-label">名称</div>
          <div className="detail-value">{company.name}</div>
        </div>
        <div>
          <div className="detail-label">行业</div>
          <div className="detail-value">{company.industry || '-'}</div>
        </div>
        <div>
          <div className="detail-label">时区</div>
          <div className="detail-value">{company.timezone || '-'}</div>
        </div>
        <div>
          <div className="detail-label">初始预算</div>
          <div className="detail-value">{company.initialBudget ?? '-'}</div>
        </div>
        <div>
          <div className="detail-label">描述</div>
          <div className="detail-value">{company.description || '-'}</div>
        </div>
        <div>
          <div className="detail-label">所属用户（createdBy）</div>
          <div className="detail-value">{company.createdBy ? <code>{company.createdBy}</code> : '-'}</div>
        </div>
      </div>
    </div>
  );
};

const MembersTab: React.FC<{ company: AiCompanyDetail }> = ({ company }) => {
  return (
    <div className="card">
      <h3 className="section-title">成员管理（预留）</h3>
      <p className="dash-muted">用户与公司是 1:n。此处后续接入“公司成员列表 / 管理员设置 / 角色与权限（RBAC）”。</p>
      <div style={{ marginTop: 12 }}>
        <div className="detail-label">所属用户（createdBy）</div>
        <div className="detail-value">{company.createdBy ? <code>{company.createdBy}</code> : '-'}</div>
      </div>
    </div>
  );
};

const BillingTab: React.FC<{ billing: BillingSummary | null }> = ({ billing }) => {
  return (
    <div className="card">
      <h3 className="section-title">订阅计费</h3>
      {billing ? (
        <div className="detail-grid">
          <div>
            <div className="detail-label">预算总额</div>
            <div className="detail-value">{billing.budget ? `${billing.budget.totalAmount} ${billing.budget.currency}` : '-'}</div>
          </div>
          <div>
            <div className="detail-label">已使用</div>
            <div className="detail-value">{billing.budget ? `${billing.budget.usedAmount} ${billing.budget.currency}` : '-'}</div>
          </div>
          <div>
            <div className="detail-label">预警阈值</div>
            <div className="detail-value">{billing.budget ? `${billing.budget.warningThreshold}` : '-'}</div>
          </div>
          <div>
            <div className="detail-label">今日消耗</div>
            <div className="detail-value">{billing.aggregates.todayCost}</div>
          </div>
          <div>
            <div className="detail-label">本月消耗</div>
            <div className="detail-value">{billing.aggregates.monthCost}</div>
          </div>
        </div>
      ) : (
        <div className="dash-muted">暂未获取到计费数据。</div>
      )}
    </div>
  );
};

const KycTab: React.FC<{ company: AiCompanyDetail }> = ({ company }) => {
  return (
    <div className="card">
      <h3 className="section-title">认证资料（预留）</h3>
      <p className="dash-muted">后续接入企业认证/KYC资料展示与审核流。当前仅展示联系信息占位。</p>
      <div className="detail-grid" style={{ marginTop: 12 }}>
        <div>
          <div className="detail-label">联系邮箱</div>
          <div className="detail-value">{company.contactEmail || '-'}</div>
        </div>
        <div>
          <div className="detail-label">联系电话</div>
          <div className="detail-value">{company.contactPhone || '-'}</div>
        </div>
      </div>
    </div>
  );
};

const AuditTab: React.FC<{ companyId: string }> = ({ companyId }) => {
  // MVP: 仅展示说明，后续对接统一审计日志服务
  return (
    <div className="card">
      <h3 className="section-title">审计日志（预留）</h3>
      <p className="dash-muted">
        将在此对接公司级别的审计日志查询接口，按时间倒序展示关键操作记录。当前公司 ID：
        <code>{companyId}</code>
      </p>
    </div>
  );
};

