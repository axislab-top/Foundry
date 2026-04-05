import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../../layouts/AppLayout';
import { CompanyProvider } from '../../contexts/CompanyContext';
import { AuthProvider } from '../auth/AuthProvider';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { PublicOnlyRoute } from '../auth/PublicOnlyRoute';
import { CallbackPage } from '../../pages/auth/CallbackPage';
import { LoginPage } from '../../pages/auth/LoginPage';
import { RegisterPage } from '../../pages/auth/RegisterPage';
import { DashboardPage } from '../../pages/dashboard/DashboardPage';
import { OrganizationPage } from '../../pages/organization/OrganizationPage';
import { AgentsPage } from '../../pages/agents/AgentsPage';
import { TasksPage } from '../../pages/tasks/TasksPage';
import { CollaborationPage } from '../../pages/collaboration/CollaborationPage';
import { CreateCompanyPage } from '../../pages/companies/CreateCompanyPage';
import { MemoryPage } from '../../pages/memory/MemoryPage';
import { BillingPage } from '../../pages/billing/BillingPage';
import { HeartbeatPage } from '../../pages/workspace/HeartbeatPage';
import { AuditPage } from '../../pages/workspace/AuditPage';
import { MarketplaceHirePage } from '../../pages/marketplace/MarketplaceHirePage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CompanyProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route path="/auth/callback" element={<CallbackPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/companies/new" element={<CreateCompanyPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/organization" element={<OrganizationPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/marketplace-hire" element={<MarketplaceHirePage />} />
                <Route path="/collaboration" element={<CollaborationPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/heartbeat" element={<HeartbeatPage />} />
                <Route path="/audit" element={<AuditPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CompanyProvider>
    </AuthProvider>
  );
};
