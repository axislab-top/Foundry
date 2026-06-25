import type { ReactElement } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { MobileNav } from './MobileNav';

export function TopBar(): ReactElement {
  return (
    <header className="erp-topbar">
      <MobileNav />
      <Breadcrumbs />
      <span className="erp-topbar__meta">ERP Console</span>
    </header>
  );
}
