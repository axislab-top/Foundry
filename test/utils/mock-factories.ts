/**
 * Mock工厂 - 用于创建各种服务的Mock实例
 */

import { CacheService } from '@service/cache';
import { ConfigService } from '@service/config';
import { MessagingService } from '@service/messaging';
import { MonitoringService } from '@service/monitoring';
import { SecurityService } from '@service/security';
import { LoggingService } from '@service/logging';
import { HttpService } from '@nestjs/axios';

/**
 * 创建Mock CacheService
 */
export function createMockCacheService(): jest.Mocked<CacheService> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    size: jest.fn(),
    ttl: jest.fn(),
    getAdapter: jest.fn(),
    isConnected: jest.fn(() => true),
    healthCheck: jest.fn(() => Promise.resolve(true)),
  } as any;
}

/**
 * 创建Mock ConfigService
 */
export function createMockConfigService(overrides: any = {}): jest.Mocked<ConfigService> {
  return {
    get: jest.fn(),
    getAppConfig: jest.fn(),
    getDatabaseConfig: jest.fn(),
    getRedisConfig: jest.fn(),
    getMonitoringConfig: jest.fn(),
    getHttpConfig: jest.fn(),
    getCorsConfig: jest.fn(),
    getServicesConfig: jest.fn(() => ({
      apiServiceUrl: 'http://localhost:3000',
      gatewayServiceUrl: 'http://localhost:3001',
      loggingServiceUrl: 'http://localhost:3002',
      webhooksServiceUrl: 'http://localhost:3003',
      workerServiceUrl: 'http://localhost:3004',
    })),
    getApiRpcMinTimeoutMs: jest.fn(() => 0),
    ...overrides,
  } as any;
}

/**
 * 创建Mock MessagingService
 */
export function createMockMessagingService(): jest.Mocked<MessagingService> {
  return {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    isConnected: jest.fn(() => true),
    healthCheck: jest.fn(() => Promise.resolve(true)),
    close: jest.fn(),
  } as any;
}

/**
 * 创建Mock MonitoringService
 */
export function createMockMonitoringService(): jest.Mocked<MonitoringService> {
  return {
    increment: jest.fn(),
    decrement: jest.fn(),
    set: jest.fn(),
    histogram: jest.fn(),
    gauge: jest.fn(),
    timer: jest.fn(),
    getAdapter: jest.fn(),
    isEnabled: jest.fn(() => true),
  } as any;
}

/**
 * 创建Mock SecurityService
 */
export function createMockSecurityService(): jest.Mocked<SecurityService> {
  return {
    getHashingManager: jest.fn(() => ({
      hash: jest.fn(() => Promise.resolve('hashed-password')),
      verify: jest.fn(() => Promise.resolve(true)),
    })),
    getTokenManager: jest.fn(() => ({
      generate: jest.fn(() => 'mock-token'),
      verify: jest.fn(() => ({ id: 'user-123', username: 'testuser' })),
      decode: jest.fn(() => ({ id: 'user-123', username: 'testuser' })),
    })),
    encrypt: jest.fn((data: string) => `encrypted-${data}`),
    decrypt: jest.fn((data: string) => data.replace('encrypted-', '')),
  } as any;
}

/**
 * 创建Mock LoggingService
 */
export function createMockLoggingService(): jest.Mocked<LoggingService> {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    setContext: jest.fn(),
    getContext: jest.fn(() => ({})),
  } as any;
}

/**
 * 创建Mock HttpService
 */
export function createMockHttpService(): jest.Mocked<HttpService> {
  return {
    request: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    head: jest.fn(),
    axiosRef: {} as any,
  } as any;
}

/**
 * 创建Mock用户数据
 */
export function createMockUser(overrides: any = {}): any {
  return {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed-password',
    roles: ['user'],
    permissions: [],
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * 创建Mock JWT Payload
 */
export function createMockJwtPayload(overrides: any = {}): any {
  return {
    sub: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['user'],
    permissions: [],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

/**
 * 创建Mock事件数据
 */
export function createMockEvent(eventType: string, data: any = {}): any {
  return {
    eventId: `event-${Date.now()}`,
    eventType,
    aggregateId: 'aggregate-123',
    aggregateType: 'user',
    occurredAt: new Date().toISOString(),
    version: 1,
    data,
  };
}








