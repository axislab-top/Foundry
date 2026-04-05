import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ProxyController } from './proxy.controller.js';
import { RoutingService } from './routing.service.js';

describe('ProxyController (e2e)', () => {
  let app: INestApplication;
  let routingService: { route: jest.Mock };

  beforeEach(async () => {
    routingService = {
      route: jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { ok: true },
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: RoutingService,
          useValue: routingService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should forward x-company-id to routing layer', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('x-company-id', 'company-e2e')
      .expect(200);

    expect(routingService.route).toHaveBeenCalledTimes(1);
    const callArgs = routingService.route.mock.calls[0];
    expect(callArgs[0]).toBe('GET');
    expect(callArgs[1]).toBe('/v1/users');
    expect(callArgs[2].headers['x-company-id']).toBe('company-e2e');
  });

  it('should forward company header for companies endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/companies')
      .set('x-company-id', 'company-acceptance')
      .expect(200);

    expect(routingService.route).toHaveBeenCalledTimes(1);
    const callArgs = routingService.route.mock.calls[0];
    expect(callArgs[1]).toBe('/v1/companies');
    expect(callArgs[2].headers['x-company-id']).toBe('company-acceptance');
  });

  it('should forward company header for organizations tree endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/organizations/tree')
      .set('x-company-id', 'company-org')
      .expect(200);

    expect(routingService.route).toHaveBeenCalledTimes(1);
    const callArgs = routingService.route.mock.calls[0];
    expect(callArgs[1]).toBe('/v1/organizations/tree');
    expect(callArgs[2].headers['x-company-id']).toBe('company-org');
  });
});
