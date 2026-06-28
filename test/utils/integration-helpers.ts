/**
 * 集成测试辅助工具
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';

/**
 * 创建集成测试应用
 */
export async function createIntegrationTestApp(
  module: TestingModule,
  options?: { globalPrefix?: string },
): Promise<INestApplication> {
  const app = module.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (options?.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }

  await app.init();
  return app;
}

/**
 * 创建HTTP测试客户端
 */
export function createHttpClient(app: INestApplication): request.SuperTest<request.Test> {
  return request(app.getHttpServer());
}

/**
 * 创建带认证的HTTP请求
 */
export function createAuthenticatedRequest(
  client: request.SuperTest<request.Test>,
  token: string,
): request.Test {
  return client.set('Authorization', `Bearer ${token}`);
}

/**
 * 等待服务启动
 */
export async function waitForService(
  checkFn: () => Promise<boolean>,
  maxAttempts = 10,
  delay = 1000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (await checkFn()) {
        return;
      }
    } catch (error) {
      // 忽略错误，继续重试
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Service did not start within timeout');
}








