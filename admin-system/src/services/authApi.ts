import { apiClient } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

const unwrap = <T>(response: ApiEnvelope<T>): T => {
  if (!response?.success) {
    throw new Error('Unexpected API response');
  }
  return response.data;
};

/**
 * admin-system 使用独立的管理员登录入口：POST /auth/admin/login
 */
export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResult> {
    const { data } = await apiClient.post<ApiEnvelope<AuthResult>>(
      '/auth/admin/login',
      payload,
    );
    return unwrap(data);
  },

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { data } = await apiClient.post<ApiEnvelope<AuthResult>>(
      '/auth/refresh',
      { refreshToken },
    );
    return unwrap(data);
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};

