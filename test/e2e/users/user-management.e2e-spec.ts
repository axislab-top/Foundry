/**
 * 用户管理E2E测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../apps/gateway/src/app.module.js';
import { createIntegrationTestApp, createHttpClient, createAuthenticatedRequest } from '../../utils/integration-helpers.js';

describe('User Management E2E', () => {
  let app: INestApplication;
  let httpClient: request.SuperTest<request.Test>;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createIntegrationTestApp(moduleFixture);
    httpClient = createHttpClient(app);

    // 注册并登录获取token
    const registerDto = {
      username: 'e2e-user',
      email: 'e2e-user@example.com',
      password: 'password123',
    };

    await httpClient.post('/auth/register').send(registerDto).expect(201);

    const loginResponse = await httpClient
      .post('/auth/login')
      .send({
        email: registerDto.email,
        password: registerDto.password,
      })
      .expect(200);

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/:id', () => {
    it('should get user by id', async () => {
      // 先创建一个用户
      const createDto = {
        username: 'test-user-1',
        email: 'test-user-1@example.com',
        password: 'password123',
      };

      const createResponse = await createAuthenticatedRequest(
        httpClient,
        accessToken,
      )
        .post('/api/users')
        .send(createDto)
        .expect(201);

      const userId = createResponse.body.data.id;

      // 获取用户
      const response = await createAuthenticatedRequest(
        httpClient,
        accessToken,
      )
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(userId);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('should update user', async () => {
      // 先创建一个用户
      const createDto = {
        username: 'update-test-user',
        email: 'update-test@example.com',
        password: 'password123',
      };

      const createResponse = await createAuthenticatedRequest(
        httpClient,
        accessToken,
      )
        .post('/api/users')
        .send(createDto)
        .expect(201);

      const userId = createResponse.body.data.id;

      // 更新用户
      const updateDto = {
        username: 'updated-username',
      };

      const response = await createAuthenticatedRequest(
        httpClient,
        accessToken,
      )
        .patch(`/api/users/${userId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe(updateDto.username);
    });
  });
});








