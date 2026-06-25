export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  username: string;
  email: string;
  password: string;
  verificationCode?: string;
};

export type LogoutRequest = {
  refreshToken?: string;
};

export type AuthUser = {
  id: string;
  email?: string;
  username?: string;
};
