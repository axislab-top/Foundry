/**
 * 测试辅助工具
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * 创建测试模块
 */
export async function createTestModule(
  providers: any[],
  imports: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports,
    providers,
  }).compile();
}

/**
 * 创建测试应用
 */
export async function createTestApp(
  module: TestingModule,
): Promise<INestApplication> {
  const app = module.createNestApplication();
  return app;
}

/**
 * Mock Repository工厂
 */
export function createMockRepository<T>(): jest.Mocked<Repository<T>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    softRemove: jest.fn(),
    restore: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {} as any,
    metadata: {} as any,
    query: jest.fn(),
    clear: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    insert: jest.fn(),
    upsert: jest.fn(),
    softDelete: jest.fn(),
    exist: jest.fn(),
  } as any;
}

/**
 * 获取Mock Repository Provider
 */
export function getMockRepositoryProvider<T>(
  entity: any,
): { provide: any; useValue: jest.Mocked<Repository<T>> } {
  return {
    provide: getRepositoryToken(entity),
    useValue: createMockRepository<T>(),
  };
}

/**
 * 等待异步操作完成
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建Mock HTTP请求
 */
export function createMockRequest(overrides: any = {}): any {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    body: {},
    query: {},
    params: {},
    user: null,
    ...overrides,
  };
}

/**
 * 创建Mock HTTP响应
 */
export function createMockResponse(overrides: any = {}): any {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    ...overrides,
  };
  return res;
}

/**
 * 创建Mock ExecutionContext
 */
export function createMockExecutionContext(overrides: any = {}): any {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(createMockRequest()),
      getResponse: jest.fn().mockReturnValue(createMockResponse()),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
    ...overrides,
  };
}

