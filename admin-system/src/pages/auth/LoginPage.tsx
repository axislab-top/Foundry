import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../modules/auth/AuthProvider';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, login, isLoading, getErrorMessage } = useAuth();

  const defaultCreds = useMemo(
    () => ({
      email: 'admin@example.com',
      password: 'admin123',
    }),
    [],
  );

  const [email, setEmail] = useState(defaultCreds.email);
  const [password, setPassword] = useState(defaultCreds.password);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">Admin</div>
          <div className="auth-title-wrap">
            <h2 className="auth-title">管理员登录</h2>
            <p className="auth-hint">仅允许 `admin/superadmin` 角色账号登录（无注册入口）。</p>
          </div>
        </div>

        <div className="auth-defaults">
          <div className="auth-defaults-label">默认管理员（如未修改环境变量）</div>
          <div className="auth-defaults-values">
            <div className="auth-defaults-row">
              <span className="auth-defaults-key">Email</span>
              <span className="auth-defaults-value">{defaultCreds.email}</span>
            </div>
            <div className="auth-defaults-row">
              <span className="auth-defaults-key">Password</span>
              <span className="auth-defaults-value">{defaultCreds.password}</span>
            </div>
          </div>
          <div className="auth-defaults-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={isLoading}
              onClick={() => {
                setEmail(defaultCreds.email);
                setPassword(defaultCreds.password);
                setError(null);
              }}
            >
              使用默认账号
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="auth-password-wrap">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                className="auth-password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                disabled={isLoading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>

          <div className="auth-footnote">
            提示：登录接口为 <code>/api/auth/admin/login</code>
          </div>
        </form>
      </div>
    </div>
  );
};

