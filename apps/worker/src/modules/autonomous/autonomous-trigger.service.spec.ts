jest.mock('../../common/config/config.service.js', () => ({
  ConfigService: class ConfigService {},
}));

import { AutonomousTriggerService } from './autonomous-trigger.service.js';

describe('AutonomousTriggerService', () => {
  it('applies cooldown per company and trigger kind', () => {
    const config = {
      getAutonomousCooldownTaskCompletedMs: () => 60_000,
      getAutonomousCooldownBudgetWarningMs: () => 120_000,
    };
    const svc = new AutonomousTriggerService(config as any);

    expect(svc.shouldRun('c1', 'task_completed')).toBe(true);
    expect(svc.shouldRun('c1', 'task_completed')).toBe(false);
    expect(svc.shouldRun('c2', 'task_completed')).toBe(true);

    expect(svc.shouldRun('c1', 'budget_warning')).toBe(true);
    expect(svc.shouldRun('c1', 'budget_warning')).toBe(false);
  });

  it('allows when cooldown is 0', () => {
    const config = {
      getAutonomousCooldownTaskCompletedMs: () => 0,
      getAutonomousCooldownBudgetWarningMs: () => 0,
    };
    const svc = new AutonomousTriggerService(config as any);
    expect(svc.shouldRun('c1', 'task_completed')).toBe(true);
    expect(svc.shouldRun('c1', 'task_completed')).toBe(true);
  });
});
