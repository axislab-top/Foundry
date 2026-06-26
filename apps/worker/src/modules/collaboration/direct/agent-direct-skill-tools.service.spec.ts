import { of } from 'rxjs';
import { ToolRegistry } from '@service/ai';
import type { SkillToolSnapshot } from '@contracts/events';
import { AgentDirectSkillToolsService } from './agent-direct-skill-tools.service.js';

function snap(name: string): SkillToolSnapshot {
  return {
    id: `id-${name}`,
    name,
    description: `desc ${name}`,
    toolSchema: { type: 'object', properties: {} },
    promptTemplate: '# body',
    implementationType: 'prompt',
    handlerConfig: null,
    requiredPermissions: [],
    version: 1,
    isPublic: true,
    isSystem: false,
    boundTools: [],
    boundMcpTools: [],
  };
}

describe('AgentDirectSkillToolsService', () => {
  it('builds non-empty tools from effectiveSkillSnapshots', async () => {
    const registry = new ToolRegistry();
    const config = {
      getWorkerActorUserId: () => 'worker-1',
      getApiRpcTimeoutMs: () => 5_000,
      isSkillProgressiveDisclosureEnabled: () => true,
      isToolSearchEnabled: () => false,
      getToolSearchThreshold: () => 0,
    };
    const apiRpcInteractive = {
      send: jest.fn(() =>
        of({
          skillIds: ['id-echo', 'id-report-skill'],
          skills: [snap('echo'), snap('report-skill')],
        }),
      ),
    };
    const companyToolsets = {
      getEnabledToolsets: jest.fn(async () => []),
    };

    const svc = new AgentDirectSkillToolsService(
      config as any,
      registry,
      companyToolsets as any,
      apiRpcInteractive as any,
    );

    const pack = await svc.build({ companyId: 'c1', agentId: 'a1' });
    expect(pack.skillCount).toBe(2);
    expect(pack.tools.length).toBeGreaterThan(0);
    expect(pack.allowedToolNames.has('echo')).toBe(true);
    expect(pack.capabilitySkillIds).toEqual(['id-echo', 'id-report-skill']);
    expect(pack.progressiveDisclosure).toBe(true);
    expect(pack.usesToolCatalog).toBe(false);
  });

  it('returns empty pack when RPC yields no skills', async () => {
    const registry = new ToolRegistry();
    const config = {
      getWorkerActorUserId: () => 'worker-1',
      getApiRpcTimeoutMs: () => 5_000,
      isSkillProgressiveDisclosureEnabled: () => true,
      isToolSearchEnabled: () => false,
      getToolSearchThreshold: () => 0,
    };
    const apiRpcInteractive = {
      send: jest.fn(() => of({ skillIds: [], skills: [] })),
    };
    const companyToolsets = { getEnabledToolsets: jest.fn(async () => []) };

    const svc = new AgentDirectSkillToolsService(
      config as any,
      registry,
      companyToolsets as any,
      apiRpcInteractive as any,
    );

    const pack = await svc.build({ companyId: 'c1', agentId: 'a1' });
    expect(pack.tools).toEqual([]);
    expect(pack.skillCount).toBe(0);
  });
});
