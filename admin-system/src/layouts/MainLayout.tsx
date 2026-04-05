import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Bell,
  Box,
  Building2,
  FileText,
  Key,
  LayoutDashboard,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wand2,
} from 'lucide-react';

const sidebarItems: Array<{
  to: string;
  label: string;
  section?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  isTodo?: boolean;
}> = [
  { to: '/', label: 'Dashboard', section: 'Overview', icon: LayoutDashboard },
  { to: '/companies', label: 'Companies', section: 'Management', icon: Building2 },
  { to: '/users', label: 'Users', section: 'Management', icon: Users, isTodo: true },
  { to: '/skills', label: 'Skills', section: 'Management', icon: Wand2 },
  { to: '/templates', label: 'Templates', section: 'Catalog', icon: Box, isTodo: true },
  { to: '/marketplace', label: 'Marketplace', section: 'Catalog', icon: ShoppingCart },
  { to: '/llm-keys', label: 'LLM Keys', section: 'Core', icon: Key },
  { to: '/monitoring', label: 'Monitoring', section: 'Ops', icon: Activity, isTodo: true },
  { to: '/audit-logs', label: 'Audit Logs', section: 'Ops', icon: FileText, isTodo: true },
  { to: '/settings', label: 'Settings', section: 'System', icon: Settings, isTodo: true },
];

export const MainLayout: React.FC = () => {
  const sections = sidebarItems.reduce<
    Array<{
      title: string;
      items: Array<{
        to: string;
        label: string;
        icon?: React.ComponentType<{ size?: number; className?: string }>;
        isTodo?: boolean;
      }>;
    }>
  >((acc, item) => {
    const title = item.section || 'Menu';
    const last = acc[acc.length - 1];
    if (!last || last.title !== title) {
      acc.push({
        title,
        items: [{ to: item.to, label: item.label, icon: item.icon, isTodo: item.isTodo }],
      });
      return acc;
    }
    last.items.push({ to: item.to, label: item.label, icon: item.icon, isTodo: item.isTodo });
    return acc;
  }, []);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-mark">A</div>
          <div className="admin-sidebar-title">
            <div className="admin-sidebar-title-main">Admin</div>
            <div className="admin-sidebar-title-sub">System</div>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          {sections.map((section) => (
            <div key={section.title} className="admin-sidebar-group">
              <div className="admin-sidebar-group-title">{section.title}</div>
              <div className="admin-sidebar-group-items">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `admin-sidebar-item${isActive ? ' is-active' : ''}`
                      }
                    >
                      <span className="admin-sidebar-item-left">
                        {Icon ? <Icon size={18} /> : null}
                        <span className="admin-sidebar-item-label">{item.label}</span>
                      </span>
                      {item.isTodo ? <span className="admin-sidebar-item-todo">TODO</span> : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-chip">
            <div className="admin-user-avatar" aria-hidden="true">
              JD
            </div>
            <div className="admin-user-meta">
              <div className="admin-user-name">Super Admin</div>
              <div className="admin-user-email">root@admin.system</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-search">
            <Search size={18} className="admin-topbar-search-icon" />
            <input placeholder="搜索公司、CEO、告警 ID..." aria-label="Global search" />
          </div>

          <div className="admin-topbar-right">
            <div className="admin-role-pill">
              <Settings size={14} />
              <span>Role: Super Admin</span>
            </div>

            <button className="admin-topbar-icon-btn" type="button" aria-label="Notifications">
              <Bell size={20} />
              <span className="admin-topbar-dot" />
            </button>

            <div className="admin-topbar-divider" />

            <div className="admin-topbar-user">
              <div className="admin-topbar-user-text">
                <div className="admin-topbar-user-name">Admin User</div>
                <div className="admin-topbar-user-sub">Global Control</div>
              </div>
              <div className="admin-topbar-settings-btn" aria-hidden="true">
                <Settings size={20} />
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

