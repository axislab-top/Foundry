import { computeWarmPoolHealth, countWarmPoolIdleSlots } from './company-workspace-metrics.util.js';

describe('company-workspace-metrics.util (P18)', () => {
  it('computeWarmPoolHealth: na when disabled', () => {
    expect(computeWarmPoolHealth({ enabled: false, targetIdleJobs: 2, currentIdle: 0 })).toBe('na');
  });

  it('computeWarmPoolHealth: green when target is 0', () => {
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 0, currentIdle: 0 })).toBe('green');
  });

  it('computeWarmPoolHealth: green when idle >= 0.8 * target', () => {
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 10, currentIdle: 8 })).toBe('green');
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 10, currentIdle: 9 })).toBe('green');
  });

  it('computeWarmPoolHealth: yellow between 0.5 and 0.8', () => {
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 10, currentIdle: 6 })).toBe('yellow');
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 10, currentIdle: 5 })).toBe('yellow');
  });

  it('computeWarmPoolHealth: red below 0.5', () => {
    expect(computeWarmPoolHealth({ enabled: true, targetIdleJobs: 10, currentIdle: 4 })).toBe('red');
  });

  it('countWarmPoolIdleSlots excludes failed', () => {
    expect(
      countWarmPoolIdleSlots([{ phase: 'Running' }, { phase: 'Failed' }, { phase: 'Pending' }]),
    ).toBe(2);
  });
});
