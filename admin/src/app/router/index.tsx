import { Suspense, type ReactElement } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy } from 'react';
import { RootLayout } from '../layout/RootLayout';
import { routes } from './routes';
import { useAuth } from '../providers/AuthProvider';

const LoginPage = lazy(() => import('../../features/auth/login-page'));
const RegisterPage = lazy(() => import('../../features/auth/register-page'));

function AuthGuard({ children }: { children: ReactElement }): ReactElement {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useAuth();
  if (isBootstrapping) {
    return <Spin size="large" style={{ display: 'block', margin: '40vh auto' }} />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function GuestOnlyGuard({ children }: { children: ReactElement }): ReactElement {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export function AppRouter(): ReactElement {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnlyGuard>
            <Suspense fallback={<Spin size="large" />}>
              <LoginPage />
            </Suspense>
          </GuestOnlyGuard>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnlyGuard>
            <Suspense fallback={<Spin size="large" />}>
              <RegisterPage />
            </Suspense>
          </GuestOnlyGuard>
        }
      />
      <Route
        element={
          <AuthGuard>
            <RootLayout />
          </AuthGuard>
        }
      >
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <Suspense fallback={<Spin size="large" />}>
                <route.component />
              </Suspense>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
