/**
 * 认证相关事件契约
 * 用于事件驱动架构中的认证领域事件
 */

import type { BaseEvent } from './base-event.js';

/**
 * 用户登录成功事件
 */
export interface LoginSuccessEvent extends BaseEvent {
  eventType: 'auth.login_success';
  aggregateType: 'auth';
  data: {
    userId: string;
    email: string;
    tokenId: string;
    loginAt: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * 用户登录失败事件
 */
export interface LoginFailedEvent extends BaseEvent {
  eventType: 'auth.login_failed';
  aggregateType: 'auth';
  data: {
    email: string;
    reason: 'invalid_credentials' | 'user_disabled' | 'user_not_found';
    failedAt: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * 用户登出事件
 */
export interface LogoutEvent extends BaseEvent {
  eventType: 'auth.logout';
  aggregateType: 'auth';
  data: {
    userId: string;
    tokenId: string;
    logoutAt: string;
  };
}

/**
 * 令牌刷新事件
 */
export interface TokenRefreshedEvent extends BaseEvent {
  eventType: 'auth.token_refreshed';
  aggregateType: 'auth';
  data: {
    userId: string;
    oldTokenId: string;
    newTokenId: string;
    refreshedAt: string;
  };
}

/**
 * 令牌撤销事件
 */
export interface TokenRevokedEvent extends BaseEvent {
  eventType: 'auth.token_revoked';
  aggregateType: 'auth';
  data: {
    userId: string;
    tokenId: string;
    revokedAt: string;
    reason?: string;
  };
}

/**
 * 认证事件联合类型
 */
export type AuthEvent =
  | LoginSuccessEvent
  | LoginFailedEvent
  | LogoutEvent
  | TokenRefreshedEvent
  | TokenRevokedEvent;

/**
 * 事件主题映射
 */
export interface AuthEventTopics {
  'auth.login_success': LoginSuccessEvent;
  'auth.login_failed': LoginFailedEvent;
  'auth.logout': LogoutEvent;
  'auth.token_refreshed': TokenRefreshedEvent;
  'auth.token_revoked': TokenRevokedEvent;
}

