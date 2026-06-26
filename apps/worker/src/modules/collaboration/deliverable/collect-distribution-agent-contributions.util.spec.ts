import {
  collectDistributionAgentContributions,
} from './collect-distribution-agent-contributions.util.js';
import { of } from 'rxjs';

describe('collectDistributionAgentContributions', () => {
  const companyId = '11111111-1111-1111-1111-111111111111';
  const actor = { id: 'worker', roles: ['admin'] };

  it('collects inline artifact content and file asset text', async () => {
    const body = '# 交付正文\n\n'.padEnd(120, '详细分析内容');
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'fileAssets.findAll') {
          return of({ items: [{ id: 'fa-1', name: 'report.md', sourceTaskId: 'child-1' }] });
        }
        if (pattern === 'fileAssets.readText') {
          return of({ text: '# 文件产出\n\n'.padEnd(120, '文件内完整正文') });
        }
        return of({});
      }),
    } as any;

    const sections = await collectDistributionAgentContributions({
      apiRpc,
      companyId,
      actor,
      rpcTimeoutMs: 5000,
      departments: [
        {
          slug: 'product',
          label: '产品部',
          l2TaskId: 'l2-1',
          childTaskIds: ['child-1'],
          deliverableArtifacts: [{ type: 'skill', label: 'Skill 产出', content: body }],
        },
      ],
    });

    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections.some((s) => s.body.includes('详细分析内容'))).toBe(true);
  });
});
