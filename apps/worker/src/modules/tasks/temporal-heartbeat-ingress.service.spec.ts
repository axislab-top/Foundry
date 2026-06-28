import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';
import { CompanyOrchestratorService } from '../company-runtime/company-orchestrator.service.js';

describe('TemporalHeartbeatIngressService', () => {
  it('assertInternalAuth rejects when secret unset', () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const orchestrator = { runHeartbeat: jest.fn() } as unknown as CompanyOrchestratorService;
    const svc = new TemporalHeartbeatIngressService(config, orchestrator);
    expect(() => svc.assertInternalAuth('x')).toThrow(ServiceUnavailableException);
  });

  it('assertInternalAuth rejects bad token', () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => 'good'),
    } as unknown as ConfigService;
    const orchestrator = { runHeartbeat: jest.fn() } as unknown as CompanyOrchestratorService;
    const svc = new TemporalHeartbeatIngressService(config, orchestrator);
    expect(() => svc.assertInternalAuth('bad')).toThrow(UnauthorizedException);
  });

  it('temporal-ingress-type-safety', async () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => 'sec'),
    } as unknown as ConfigService;
    const orchestrator = {
      runHeartbeat: jest.fn(async () => ({ runId: 'run-a' })),
    } as unknown as CompanyOrchestratorService;
    const svc = new TemporalHeartbeatIngressService(config, orchestrator);

    const out = await svc.execute({
      companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });
    expect(out.runId).toBe('run-a');
    expect(orchestrator.runHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        triggerSource: 'temporal',
      }),
    );
  });
});
