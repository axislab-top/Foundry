import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react';
import {
  adminLogin,
  adminRegister,
  clearAdminTokens,
  getRefreshToken,
  saveAdminTokens
} from '../../shared/api/client';
import { ADMIN_SESSION_EXPIRED_EVENT, installAdminCrossTabTokenSync } from '../../shared/api/tokens';
import { getRefreshedAccessTokenResult } from '../../shared/api/refreshSession';
import { startAccessTokenRefreshScheduler } from '../../shared/auth/accessTokenLifecycle';
import { decodeJwtExpMs } from '../../shared/auth/accessTokenExpiry';
import {
  clearAccessTokenExpiresAt,
  clearSessionUser,
  readSessionUser,
  writeSessionUser,
  type SessionUser
} from '../../shared/auth/sessionStorage';
import { getAccessToken } from '../../shared/api/tokens';

type RegisterPayload = {
  username: string;
  email: string;
  password: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  currentUser: SessionUser | null;
  register: (payload: RegisterPayload) => Promise<{ ok: boolean; message?: string }>;
  login: (payload: LoginPayload) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function hasPersistedCredentials(): boolean {
  return Boolean(getRefreshToken()?.trim() || getAccessToken()?.trim());
}

function isAccessTokenExpired(): boolean {
  const token = getAccessToken();
  if (!token?.trim()) return true;
  const expMs = decodeJwtExpMs(token);
  if (!expMs) return false;
  return Date.now() >= expMs - 5_000;
}

const BOOTSTRAP_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const clearLocalSession = useCallback(() => {
    clearAdminTokens();
    clearSessionUser();
    clearAccessTokenExpiresAt();
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!hasPersistedCredentials()) {
        clearLocalSession();
        return;
      }

      const session = readSessionUser();
      if (!session) {
        clearLocalSession();
        return;
      }

      if (!isAccessTokenExpired()) {
        setCurrentUser(session);
        return;
      }

      const refresh = await getRefreshedAccessTokenResult(true);
      if (cancelled) return;
      if (refresh.clearedSession || !refresh.accessToken) {
        clearLocalSession();
        return;
      }
      setCurrentUser(session);
    };

    void bootstrap().finally(() => {
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    });

    const bootstrapSafetyTimer = window.setTimeout(() => {
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    }, BOOTSTRAP_TIMEOUT_MS);

    const stopScheduler = startAccessTokenRefreshScheduler();
    const stopCrossTabSync = installAdminCrossTabTokenSync(() => {
      if (!hasPersistedCredentials()) {
        clearLocalSession();
        return;
      }
      const session = readSessionUser();
      if (session) {
        setCurrentUser(session);
      }
    });

    const onSessionExpired = () => {
      clearLocalSession();
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onSessionExpired);

    return () => {
      cancelled = true;
      clearTimeout(bootstrapSafetyTimer);
      stopScheduler();
      stopCrossTabSync();
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onSessionExpired);
    };
  }, [clearLocalSession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    try {
      const result = await adminRegister(payload);
      const username = result.user?.username;
      if (!username) {
        return { ok: false, message: '注册成功但未返回用户信息，请重新登录。' };
      }
      saveAdminTokens(result);
      writeSessionUser({ username });
      setCurrentUser({ username });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '注册失败，请重试。' };
    }
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    try {
      const result = await adminLogin(payload);
      const username = result.user?.username;
      if (!username) {
        return { ok: false, message: '登录成功但未返回用户信息，请稍后重试。' };
      }
      saveAdminTokens(result);
      const session = { username };
      writeSessionUser(session);
      setCurrentUser(session);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '账号或密码错误。' };
    }
  }, []);

  const logout = useCallback(() => {
    clearLocalSession();
  }, [clearLocalSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(currentUser) && hasPersistedCredentials(),
      isBootstrapping,
      currentUser,
      register,
      login,
      logout
    }),
    [currentUser, isBootstrapping, login, logout, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
