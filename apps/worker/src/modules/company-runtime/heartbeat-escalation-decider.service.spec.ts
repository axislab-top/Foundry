import { ConfigService } from '../../common/config/config.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';
import { HeartbeatEscalationDeciderService } from './heartbeat-escalation-decider.service.js';
import { computeHeartbeatStateFingerprint } from './heartbeat-fingerprint.util.js';
import type { CompanyReviewResult, CompanyStateSnapshot } from './dto/company-heartbeat-context.dto.js';

function snapshot(overrides: Partial<CompanyStateSnapshot['tasks']> = {}): CompanyStateSnapshot {
  return {
    companyId: 'c1',
    tickAt: '2026-05-26T00:00:00.000Z',
    triggerSource: 'nest_timer',
    capturedAt: '2026-05-26T00:00:00.000Z',
    companyName: 'Test Co',
    budget: { remaining: 100, warningThreshold: 10, totalBudgetCount: 1 },
    tasks: {
      pending: 0,
      inProgress: 1,
      review: 0,
      blocked: 0,
      completed: 5,
      ...overrides,
    },
    approvals: { pending: 0 },
    organization: { nodeCount: 3 },
    summary: { pendingRisks: 0, pendingApprovals: 0, activeGoals: 0 },
  };
}

function review(overrides: Partial<CompanyReviewResult> = {}): CompanyReviewResult {
  return {
    healthScore: 82,
    keyRisks: [],
    focusAreas: [],
    recommendations: [],
    stuckTasks: [],
    completionStatus: {
      openTasks: 1,
      completedTasks: 5,
      completionRate: 80,
      blockedRate: 0,
      stuckRate: 0,
    },
    ...overrides,
  };
}

describe('HeartbeatEscalationDeciderService', () => {
  const coordination = {
    getHeartbeatFingerprint: jest.fn(),
    getLastFullGraphAt: jest.fn(),
  } as unknown as CompanyExecutionCoordinationService;

  const config = {
    isHeartbeatTieredCeoGraphEnabled: jest.fn(() => true),
    getHeartbeatSteadyHealthMin: jest.fn(() => 65),
    getCeoLlmPlanForceIntervalMs: jest.fn(() => 3_600_000),
  } as unknown as ConfigService;

  let svc: HeartbeatEscalationDeciderService;

  beforeEach(() => {
    jest.clearAllMocks();
    (coordination.getHeartbeatFingerprint as jest.Mock).mockResolvedValue(null);
    (coordination.getLastFullGraphAt as jest.Mock).mockResolvedValue(Date.now() - 60_000);
    svc = new HeartbeatEscalationDeciderService(config, coordination);
  });

  it('returns cheap for steady state', async () => {
    const snap = snapshot();
    const realFp = computeHeartbeatStateFingerprint(snap);
    (coordination.getHeartbeatFingerprint as jest.Mock).mockResolvedValue(realFp);

    const out = await svc.decide({ companyId: 'c1', review: review(), snapshot: snap });
    expect(out.tier).toBe('cheap');
    expect(out.reason).toBe('steady_state');
  });

  it('returns full when stuck tasks present', async () => {
    const out = await svc.decide({
      companyId: 'c1',
      review: review({
        stuckTasks: [
          {
            id: 't1',
            title: 'stuck',
            status: 'in_progress',
            ageHours: 5,
            possibleCause: 'timeout',
          },
        ],
      }),
      snapshot: snapshot(),
    });
    expect(out.tier).toBe('full');
    expect(out.reason).toBe('stuck_tasks');
  });

  it('returns full when fingerprint changed', async () => {
    (coordination.getHeartbeatFingerprint as jest.Mock).mockResolvedValue('old-fingerprint');
    const out = await svc.decide({ companyId: 'c1', review: review(), snapshot: snapshot() });
    expect(out.tier).toBe('full');
    expect(out.reason).toBe('fingerprint_changed');
  });

  it('returns full when force interval elapsed', async () => {
    (coordination.getLastFullGraphAt as jest.Mock).mockResolvedValue(Date.now() - 4_000_000);
    const out = await svc.decide({ companyId: 'c1', review: review(), snapshot: snapshot() });
    expect(out.tier).toBe('full');
    expect(out.reason).toBe('force_interval');
  });

  it('returns full when blocked tasks in snapshot', async () => {
    const out = await svc.decide({
      companyId: 'c1',
      review: review(),
      snapshot: snapshot({ blocked: 2 }),
    });
    expect(out.tier).toBe('full');
    expect(out.reason).toBe('blocked_tasks');
  });

  it('returns full when tiered mode disabled', async () => {
    (config.isHeartbeatTieredCeoGraphEnabled as jest.Mock).mockReturnValue(false);
    const out = await svc.decide({ companyId: 'c1', review: review(), snapshot: snapshot() });
    expect(out.tier).toBe('full');
    expect(out.reason).toBe('tiered_disabled');
  });
});
