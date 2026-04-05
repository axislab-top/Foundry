import { UnauthorizedException } from '@nestjs/common';
import { InternalTemporalController } from './internal-temporal.controller.js';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';

describe('InternalTemporalController', () => {
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('delegates to ingress after assertInternalAuth', async () => {
    const ingress = {
      assertInternalAuth: jest.fn(),
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as TemporalHeartbeatIngressService;
    const controller = new InternalTemporalController(ingress);
    const body = { companyId, runId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
    await controller.companyHeartbeat('good-secret', body);
    expect(ingress.assertInternalAuth).toHaveBeenCalledWith('good-secret');
    expect(ingress.execute).toHaveBeenCalledWith(body);
  });

  it('propagates auth failure from ingress', async () => {
    const ingress = {
      assertInternalAuth: jest.fn(() => {
        throw new UnauthorizedException('bad');
      }),
      execute: jest.fn(),
    } as unknown as TemporalHeartbeatIngressService;
    const controller = new InternalTemporalController(ingress);
    await expect(
      controller.companyHeartbeat(undefined, { companyId } as { companyId: string }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ingress.execute).not.toHaveBeenCalled();
  });
});
