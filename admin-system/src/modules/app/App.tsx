import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from '../../layouts/MainLayout';
import { DashboardPage } from '../../pages/dashboard/DashboardPage';
import { CompaniesPage } from '../../pages/companies/CompaniesPage';
import { CompanyDetailPage } from '../../pages/companies/CompanyDetailPage';
import { UsersPage } from '../../pages/users/UsersPage';
import { SkillsManagementPage } from '../../pages/skills/SkillsManagementPage';
import { TemplatesPage } from '../../pages/templates/TemplatesPage';
import { MarketplacePage } from '../../pages/marketplace/MarketplacePage';
import { LlmKeysPage } from '../../pages/llm-keys/LlmKeysPage';
import { MonitoringPage } from '../../pages/monitoring/MonitoringPage';
import { AuditLogsPage } from '../../pages/audit-logs/AuditLogsPage';
import { SettingsPage } from '../../pages/settings/SettingsPage';
import { LoginPage } from '../../pages/auth/LoginPage';
import { ProtectedAdminRoute } from '../auth/ProtectedRoute';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedAdminRoute>
            <MainLayout />
          </ProtectedAdminRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:companyId/*" element={<CompanyDetailPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/skills" element={<SkillsManagementPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/llm-keys" element={<LlmKeysPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

