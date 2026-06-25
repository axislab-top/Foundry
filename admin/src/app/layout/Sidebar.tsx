import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/rollout/phase3', label: 'Phase 3 Rollout' },
  { to: '/audit-logs', label: 'Audit Logs' }
];

export function Sidebar(): ReactElement {
  return (
    <aside className="erp-sidebar">
      <h2 className="erp-sidebar__title">Foundry Admin</h2>
      <nav className="erp-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              isActive ? 'erp-nav__link erp-nav__link--active' : 'erp-nav__link'
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
