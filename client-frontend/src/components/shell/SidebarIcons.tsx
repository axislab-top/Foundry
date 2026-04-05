import React from 'react';

const iconClass = 'sidebar-icon';

export const IconDashboard: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const IconOrg: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="3" r="2" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="3" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="13" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 5v3M8 8l-5 2M8 8l5 2" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const IconAgent: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const IconCollab: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 3h12v8H9l-3 2V11H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export const IconTasks: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconMemory: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <ellipse cx="8" cy="5" rx="5" ry="3" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3 5v6c0 1.7 2.2 3 5 3s5-1.3 5-3V5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3 8.5c0 1.7 2.2 3 5 3s5-1.3 5-3" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const IconBilling: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M1 7h14" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="10.5" r="0.8" fill="currentColor" />
  </svg>
);

export const IconHeartbeat: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const IconAudit: React.FC = () => (
  <svg className={iconClass} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 4h12M2 8h9M2 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
