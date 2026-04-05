/**
 * 用户相关事件契约
 * 用于事件驱动架构中的用户领域事件
 */

import type { BaseEvent } from './base-event.js';

/**
 * 用户创建事件
 */
export interface UserCreatedEvent extends BaseEvent {
  eventType: 'user.created';
  aggregateType: 'user';
  data: {
    userId: string;
    username: string;
    email: string;
    roles: string[];
    permissions: string[];
    createdAt: string;
    companyId?: string;
  };
}

/**
 * 用户更新事件
 */
export interface UserUpdatedEvent extends BaseEvent {
  eventType: 'user.updated';
  aggregateType: 'user';
  data: {
    userId: string;
    companyId?: string;
    changes: {
      username?: string;
      email?: string;
      roles?: string[];
      permissions?: string[];
      enabled?: boolean;
    };
    updatedAt: string;
  };
}

/**
 * 用户删除事件
 */
export interface UserDeletedEvent extends BaseEvent {
  eventType: 'user.deleted';
  aggregateType: 'user';
  data: {
    userId: string;
    deletedAt: string;
    companyId?: string;
  };
}

/**
 * 用户登录事件
 */
export interface UserLoggedInEvent extends BaseEvent {
  eventType: 'user.logged_in';
  aggregateType: 'user';
  data: {
    userId: string;
    email: string;
    loginAt: string;
    ipAddress?: string;
    userAgent?: string;
    companyId?: string;
  };
}

/**
 * 用户角色变更事件
 */
export interface UserRoleChangedEvent extends BaseEvent {
  eventType: 'user.role_changed';
  aggregateType: 'user';
  data: {
    userId: string;
    oldRoles: string[];
    newRoles: string[];
    changedAt: string;
    companyId?: string;
  };
}

/**
 * 用户事件联合类型
 */
export type UserEvent =
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent
  | UserLoggedInEvent
  | UserRoleChangedEvent;

/**
 * 事件主题映射
 */
export interface UserEventTopics {
  'user.created': UserCreatedEvent;
  'user.updated': UserUpdatedEvent;
  'user.deleted': UserDeletedEvent;
  'user.logged_in': UserLoggedInEvent;
  'user.role_changed': UserRoleChangedEvent;
}

