import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, user } = useAuth();

  const roles = Array.isArray(user?.roles) ? user?.roles : [];
  const hasAdminRole = roles.includes('admin') || roles.includes('superadmin');

  if (!isAuthenticated || !hasAdminRole) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

