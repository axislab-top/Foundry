import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthProvider';
import { useCompany } from '../contexts/CompanyContext';
import { listAgents } from '../services/agentsApi';
import { listRooms, roomsQueryKey } from '../services/collaborationApi';
import {
  IconAgent,
  IconAudit,
  IconBilling,
  IconCollab,
  IconDashboard,
  IconHeartbeat,
  IconMemory,
  IconOrg,
  IconTasks,
} from '../components/shell/SidebarIcons';

function userInitials(user: { username?: string; email?: string } | null): string {
  const s = user?.username || user?.email || 'U';
  const parts = s.split(/[@\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return s.slice(0, 2).toUpperCase();
}

function companyInitials(name: string): string {
  const t = name.trim();
  if (!t) return '·';
  const segs = t.split(/[\s\u3000]+/).filter(Boolean);
  if (segs.length >= 2) {
    return (segs[0][0] + segs[1][0]).toUpperCase().slice(0, 2);
  }
  return t.slice(0, 2).toUpperCase();
}

function companyAvatarHue(companyId: string): number {
  let h = 0;
  for (let i = 0; i < companyId.length; i += 1) {
    h = companyId.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `sidebar-item${isActive ? ' active' : ''}`;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const { companies, companyId, setCompanyId, isLoading: companiesLoading } = useCompany();
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const companySwitcherRef = useRef<HTMLDivElement>(null);
  const companyListId = useId();

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId],
  );

  useEffect(() => {
    if (!companyMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (companySwitcherRef.current && !companySwitcherRef.current.contains(e.target as Node)) {
        setCompanyMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCompanyMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [companyMenuOpen]);

  const agentsCountQ = useQuery({
    queryKey: ['agents', 'sidebar-count', companyId],
    queryFn: () => listAgents({ page: 1, pageSize: 1 }),
    enabled: Boolean(companyId),
  });
  const agentCount = agentsCountQ.data?.total ?? 0;

  const collabRoomsQ = useQuery({
    queryKey: roomsQueryKey(companyId),
    queryFn: listRooms,
    enabled: Boolean(companyId),
  });
  const collabRoomCount = collabRoomsQ.data?.length ?? 0;

  const initials = useMemo(() => userInitials(user), [user]);

  return (
    <div className="app-shell">
      <header className="topnav">
        <NavLink to="/dashboard" className="orgos-logo">
          <span className="logo-dot">
            <svg viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="#fff" strokeWidth="1.5" />
              <circle cx="7" cy="7" r="2" fill="#fff" />
            </svg>
          </span>
          Foundry
        </NavLink>

        <div className="company-switcher" ref={companySwitcherRef}>
          {companiesLoading ? (
            <div className="company-switcher__idle">
              <span className="company-avatar company-avatar--skeleton" aria-hidden />
              <span className="company-switcher__loading">加载中…</span>
            </div>
          ) : companies.length === 0 ? (
            <button
              type="button"
              className="qa-btn"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => navigate('/companies/new')}
            >
              创建公司
            </button>
          ) : (
            <>
              <button
                type="button"
                className="company-switcher__trigger"
                aria-expanded={companyMenuOpen}
                aria-haspopup="listbox"
                aria-controls={companyListId}
                onClick={() => setCompanyMenuOpen((o) => !o)}
              >
                <span
                  className="company-avatar company-avatar--named"
                  style={
                    activeCompany
                      ? {
                          background: `linear-gradient(135deg, hsl(${companyAvatarHue(activeCompany.id)}, 52%, 48%), hsl(${(companyAvatarHue(activeCompany.id) + 44) % 360}, 58%, 42%))`,
                        }
                      : undefined
                  }
                  aria-hidden
                >
                  {activeCompany ? companyInitials(activeCompany.name) : '?'}
                </span>
                <span className="company-switcher__label">
                  <span className="company-switcher__name">{activeCompany?.name ?? '选择公司'}</span>
                  <span className="company-switcher__hint">工作区</span>
                </span>
                <span className={`company-switcher__chevron${companyMenuOpen ? ' company-switcher__chevron--open' : ''}`} aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 4.5 6 7.5 9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              {companyMenuOpen ? (
                <div className="company-switcher__dropdown">
                  <ul
                    id={companyListId}
                    className="company-switcher__menu"
                    role="listbox"
                    aria-label="切换工作区"
                  >
                    {companies.map((c) => {
                      const selected = c.id === companyId;
                      return (
                        <li key={c.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`company-switcher__option${selected ? ' company-switcher__option--active' : ''}`}
                            onClick={() => {
                              setCompanyId(c.id);
                              setCompanyMenuOpen(false);
                            }}
                          >
                            <span
                              className="company-avatar company-avatar--named company-avatar--sm"
                              style={{
                                background: `linear-gradient(135deg, hsl(${companyAvatarHue(c.id)}, 52%, 48%), hsl(${(companyAvatarHue(c.id) + 44) % 360}, 58%, 42%))`,
                              }}
                              aria-hidden
                            >
                              {companyInitials(c.name)}
                            </span>
                            <span className="company-switcher__option-text">
                              <span className="company-switcher__option-name">{c.name}</span>
                            </span>
                            {selected ? (
                              <span className="company-switcher__check" aria-hidden>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path
                                    d="M3 7.2 5.8 10 11 4.5"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="company-switcher__menu-footer">
                    <button
                      type="button"
                      className="company-switcher__add"
                      onClick={() => {
                        setCompanyMenuOpen(false);
                        navigate('/companies/new');
                      }}
                    >
                      <span className="company-switcher__add-icon" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M7 3.5v7M3.5 7h7"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      新建企业
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="nav-spacer" />
        <div className="nav-actions">
          <button type="button" className="nav-btn" title="通知" aria-label="通知">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 1a5 5 0 0 0-5 5v2.5L2 10h12l-1-1.5V6a5 5 0 0 0-5-5zM6.5 13a1.5 1.5 0 0 0 3 0"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button type="button" className="nav-btn" title="搜索" aria-label="搜索">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="m10 10 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="user-wrap">
            <button
              type="button"
              className="user-avatar"
              title="账户"
              onClick={() => void logout()}
              disabled={isLoading}
            >
              {initials}
            </button>
            <span className="badge-dot" aria-hidden />
          </div>
        </div>
      </header>

      <div className="body-row">
        <aside className="sidebar" aria-label="主导航">
          <div className="sidebar-section">
            <div className="sidebar-label">主导航</div>
            <NavLink to="/dashboard" end className={navCls}>
              <IconDashboard />
              仪表盘
            </NavLink>
            <NavLink to="/organization" className={navCls}>
              <IconOrg />
              组织结构
            </NavLink>
            <NavLink to="/agents" className={navCls}>
              <IconAgent />
              Agent 管理
              {agentCount > 0 ? <span className="sidebar-badge">{agentCount}</span> : null}
            </NavLink>
            <NavLink to="/marketplace-hire" className={navCls}>
              <span className="sidebar-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h16M4 12h10M4 17h6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M17 10l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              商城招聘
            </NavLink>
            <NavLink to="/collaboration" className={navCls}>
              <IconCollab />
              协作中心
              {collabRoomCount > 0 ? <span className="sidebar-badge">{collabRoomCount}</span> : null}
            </NavLink>
            <NavLink to="/tasks" className={navCls}>
              <IconTasks />
              任务中心
            </NavLink>
          </div>

          <div className="sidebar-div" />

          <div className="sidebar-section">
            <div className="sidebar-label">知识与治理</div>
            <NavLink to="/memory" className={navCls}>
              <IconMemory />
              记忆与知识库
            </NavLink>
            <NavLink to="/billing" className={navCls}>
              <IconBilling />
              费用与治理
            </NavLink>
          </div>

          <div className="sidebar-div" />

          <div className="sidebar-section">
            <div className="sidebar-label">工作区</div>
            <NavLink to="/heartbeat" className={navCls}>
              <IconHeartbeat />
              Heartbeat 日报
            </NavLink>
            <NavLink to="/audit" className={navCls}>
              <IconAudit />
              审计日志
            </NavLink>
          </div>
        </aside>

        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
