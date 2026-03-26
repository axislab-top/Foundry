/**
 * 用户控制器集成测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { createIntegrationTestApp, createHttpClient } from '../../utils/integration-helpers.js';

describe('UsersController (integration)', () => {
  let app: INestApplication;
  let httpClient: request.SuperTest<request.Test>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createIntegrationTestApp(moduleFixture);
    httpClient = createHttpClient(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users', () => {
    it('should return paginated users', async () => {
      const response = await httpClient
        .get('/api/users')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('total');
    });

    it('should support pagination', async () => {
      const response = await httpClient
        .get('/api/users?page=1&pageSize=10')
        .expect(200);

      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pageSize).toBe(10);
    });
  });

  describe('POST /api/users', () => {
    it('should create a new user', async () => {
      const createDto = {
        username: 'integration-test-user',
        email: 'integration-test@example.com',
        password: 'password123',
      };

      const response = await httpClient
        .post('/api/users')
        .send(createDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(createDto.email);
    });

    it('should return 409 if email already exists', async () => {
      const createDto = {
        username: 'duplicate-user',
        email: 'duplicate@example.com',
        password: 'password123',
      };

      // 创建第一个用户
      await httpClient.post('/api/users').send(createDto).expect(201);

      // 尝试创建重复用户
      await httpClient.post('/api/users').send(createDto).expect(409);
    });
  });
});








