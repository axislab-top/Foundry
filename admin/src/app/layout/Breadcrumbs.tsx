import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';

export function Breadcrumbs(): ReactElement {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return <div className="erp-breadcrumbs">{segments.length === 0 ? 'Home' : segments.join(' / ')}</div>;
}
