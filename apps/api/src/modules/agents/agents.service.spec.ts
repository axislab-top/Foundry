import { AgentsService } from './services/agents.service.js';
import { AgentValidatorService } from './services/agent-validator.service.js';
import { Agent } from './entities/agent.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { AgentAuditLog } from './entities/agent-audit-log.entity.js';

describe('AgentsService', () => {
  const companyId = '00000000-0000-0000-0000-00000000a001';
  const ownerId = '00000000-0000-0000-0000-00000000u001';
  const nodeId = '00000000-0000-0000-0000-00000000n001';

  it('should run create transaction and publish agent.created', async () => {
    const savedAgent = {
      id: 'agent-1',
      companyId,
      organizationNodeId: nodeId,
      name: 'CEO',
      role: 'ceo' as const,
      expertise: null,
      avatarUrl: null,
      systemPrompt: null,
      llmModel: null,
      personality: null,
      status: 'active' as const,
      humanInLoop: false,
      pendingConfig: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const agentsRepo: any = {
      create: jest.fn((p) => ({ ...savedAgent, ...p, id: savedAgent.id })),
      save: jest.fn(async (p) => ({ ...savedAgent, ...p })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: () => ({
          orderBy: () => ({
            skip: () => ({
              take: () => ({
                getManyAndCount: async () => [[], 0],
              }),
            }),
          }),
        }),
      })),
      count: jest.fn(async () => 0),
      delete: jest.fn(),
    };

    const auditRepo: any = {
      create: jest.fn((p) => p),
      save: jest.fn(async (p) => p),
    };

    const nodesRepo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === nodeId
          ? ({
              id: nodeId,
              companyId,
              parentId: null,
              type: 'ceo',
              name: 'CEO',
              description: null,
              agentId: null,
              order: 0,
              metadata: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as OrganizationNode)
          : null,
      ),
      update: jest.fn(async () => undefined),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => {
        const manager = {
          getRepository: (cls: any) => {
            if (cls === Agent) return agentsRepo;
            if (cls === OrganizationNode) return nodesRepo;
            if (cls === AgentAuditLog) return auditRepo;
            return agentsRepo;
          },
        };
        return cb(manager);
      }),
    };

    const tenantContext: any = { getCompanyId: () => companyId };
    const cacheService: any = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(async () => false),
      increment: jest.fn(),
      expire: jest.fn(),
    };
    const messagingService: any = { publish: jest.fn(async () => true) };
    const membershipsRepo: any = {
      findOne: jest.fn(async () => ({ role: 'owner', isActive: true })),
    };

    const validator = new AgentValidatorService(nodesRepo, membershipsRepo);
    const agentSkillService: any = {
      listSkillIdsForAgent: jest.fn(async () => []),
    };
    const service = new AgentsService(
      dataSource,
      agentsRepo,
      auditRepo,
      nodesRepo,
      tenantContext,
      cacheService,
      messagingService,
      validator,
      agentSkillService,
    );

    await service.create(
      {
        organizationNodeId: nodeId,
        name: 'CEO',
        role: 'ceo',
      },
      { id: ownerId, roles: [] },
    );

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(messagingService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.created',
        aggregateType: 'agent',
        data: expect.objectContaining({ agentId: 'agent-1', companyId }),
      }),
      expect.objectContaining({ routingKey: 'agent.created', persistent: true }),
    );
  });

  it('listDirectSubordinates returns direct child agents only', async () => {
    const supervisorAgentId = 'a-director';
    const subordinateId = 'a-exec';
    const agentsRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id === supervisorAgentId) {
          return { id: supervisorAgentId, companyId, organizationNodeId: 'n-director' };
        }
        return null;
      }),
      find: jest.fn(async () => [{ id: subordinateId, companyId }]),
    };
    const nodesRepo: any = {
      find: jest.fn(async () => [{ id: 'n-exec', parentId: 'n-director', agentId: subordinateId }]),
    };
    const service = new AgentsService(
      {} as any,
      agentsRepo,
      {} as any,
      nodesRepo,
      { getCompanyId: () => companyId } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rows = await service.listDirectSubordinates(supervisorAgentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(subordinateId);
  });
});
