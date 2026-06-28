jest.mock('../../common/config/config.service.js', () => ({
  ConfigService: class ConfigService {},
}));

import { AutonomousTriggerService } from './autonomous-trigger.service.js';

describe('AutonomousTriggerService', () => {
  it('delegates cooldown to coordination service', async () => {
    const coordination = {
      tryAutonomousTriggerAsync: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    };
    const config = {} as any;
    const svc = new AutonomousTriggerService(config, coordination as any);

    expect(await svc.shouldRun('c1', 'task_completed')).toBe(true);
    expect(await svc.shouldRun('c1', 'task_completed')).toBe(false);
  });
});
