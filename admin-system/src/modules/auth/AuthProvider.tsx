import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, type LoginPayload } from '../../services/authApi';
import { authSession, toAuthState, type AuthSessionState } from '../../services/authSession';
import { ApiError } from '../../services/apiClient';

interface AuthContextValue extends AuthSessionState {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  getErrorMessage: (error: unknown) => string;
}

const AUTH_STORAGE_KEY = 'admin_auth_state';

const parseStoredState = (): AuthSessionState => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null, expiresIn: null };
    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;
    return {
      user: parsed.user ?? null,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      expiresIn: parsed.expiresIn ?? null,
    };
  } catch {
    return { user: null, accessToken: null, refreshToken: null, expiresIn: null };
  }
};

const persistState = (s: AuthSessionState) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
};

const clearPersistedState = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthSessionState>(() => {
    const initial = parseStoredState();
    authSession.hydrate(initial);
    return initial;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return authSession.subscribe(() => {
      setState(authSession.getState());
      const s = authSession.getState();
      if (s.accessToken && s.user) {
        persistState(s);
      }
    });
  }, []);

  const login = async (payload: LoginPayload) => {
    setIsLoading(true);
    try {
      const result = await authApi.login(payload);
      const nextState = toAuthState(result);
      authSession.setState(nextState);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const rt = authSession.getRefreshToken();
      if (rt) {
        await authApi.logout(rt);
      }
    } catch {
      /* ignore */
    } finally {
      authSession.clear();
      clearPersistedState();
      setIsLoading(false);
    }
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      const details = error.payload?.details as Record<string, string[] | string> | undefined;
      if (details) {
        const firstDetail = Object.values(details)[0];
        if (Array.isArray(firstDetail)) return firstDetail[0];
        if (typeof firstDetail === 'string') return firstDetail;
      }
      const errObj = error.payload?.error as { message?: string } | undefined;
      if (errObj && typeof errObj.message === 'string') return errObj.message;
      return error.message || 'Request failed';
    }
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.accessToken && state.user),
      isLoading,
      login,
      logout,
      getErrorMessage,
    }),
    [state, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

