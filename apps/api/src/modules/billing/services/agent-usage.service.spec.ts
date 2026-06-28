import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentUsageService } from './agent-usage.service.js';
import { DailyAgentUsage } from '../entities/daily-agent-usage.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { BillingService } from './billing.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

describe('AgentUsageService.listAgentDailyUsageRange', () => {
  it('returns paginated agent-day rows with total count', async () => {
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce([{ c: 2 }])
      .mockResolvedValueOnce([
        {
          id: 'dau-1',
          agent_id: 'a1',
          agent_name: 'Atlas',
          department_name: '技术部',
          usage_date: '2026-05-01',
          input_tokens: '1000',
          output_tokens: '500',
          input_cost: '0.6',
          output_cost: '0.4',
          total_cost: '1.0',
          llm_model: 'gpt-4o-mini',
          call_count: 3,
        },
      ]);

    const usageRepo: any = {
      manager: { query: queryMock },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentUsageService,
        { provide: getRepositoryToken(DailyAgentUsage), useValue: usageRepo },
        { provide: getRepositoryToken(Agent), useValue: {} },
        { provide: getRepositoryToken(LlmKey), useValue: {} },
        { provide: BillingService, useValue: {} },
        { provide: ConfigService, useValue: { getRedisConfig: () => ({ url: '' }) } },
      ],
    }).compile();

    const svc = moduleRef.get(AgentUsageService);
    const out = await svc.listAgentDailyUsageRange('c1', {
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-07T00:00:00.000Z'),
      limit: 10,
      offset: 0,
    });

    expect(out.total).toBe(2);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      agentId: 'a1',
      agentName: 'Atlas',
      departmentName: '技术部',
      usageDate: '2026-05-01',
      inputTokens: 1000,
      outputTokens: 500,
      totalCost: '1.0',
      callCount: 3,
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const listSql = String(queryMock.mock.calls[1]?.[0] ?? '');
    expect(listSql).toContain('daily_agent_usage');
    expect(listSql).toContain('ORDER BY dau.usage_date DESC');
  });
});
