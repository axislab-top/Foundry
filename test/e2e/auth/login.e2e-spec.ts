/**
 * 登录E2E测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../apps/gateway/src/app.module.js';
import { createIntegrationTestApp, createHttpClient } from '../../utils/integration-helpers.js';

describe('Auth E2E', () => {
  let app: INestApplication;
  let httpClient: request.SuperTest<request.Test>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createIntegrationTestApp(moduleFixture, { globalPrefix: 'api' });
    httpClient = createHttpClient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // 首先注册用户
      const registerDto = {
        username: 'e2e-test-user',
        email: 'e2e-test@example.com',
        password: 'password123',
      };

      await httpClient.post('/api/auth/register').send(registerDto).expect(201);

      // 然后登录
      const loginDto = {
        email: registerDto.email,
        password: registerDto.password,
      };

      const response = await httpClient
        .post('/api/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 401 with invalid credentials', async () => {
      const loginDto = {
        email: 'invalid@example.com',
        password: 'wrongpassword',
      };

      await httpClient.post('/api/auth/login').send(loginDto).expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token', async () => {
      // 先登录获取refresh token
      const registerDto = {
        username: 'refresh-test-user',
        email: 'refresh-test@example.com',
        password: 'password123',
      };

      await httpClient.post('/api/auth/register').send(registerDto).expect(201);

      const loginResponse = await httpClient
        .post('/api/auth/login')
        .send({
          email: registerDto.email,
          password: registerDto.password,
        })
        .expect(200);

      const refreshToken = loginResponse.body.data.refreshToken;

      // 刷新token
      const response = await httpClient
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
    });
  });
});








