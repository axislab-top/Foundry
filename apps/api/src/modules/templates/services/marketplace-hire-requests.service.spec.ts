import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentValidatorService } from '../../agents/services/agent-validator.service.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { Project } from '../../projects/entities/project.entity.js';
import { MarketplaceHireRequest } from '../entities/marketplace-hire-request.entity.js';
import { MarketplaceAgentSubscription } from '../entities/marketplace-agent-subscription.entity.js';
import { AgentPurchaseService } from './agent-purchase.service.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceHireRequestsService } from './marketplace-hire-requests.service.js';
import { BillingService } from '../../billing/services/billing.service.js';
import { MarketplaceCatalogPricingService } from './marketplace-catalog-pricing.service.js';

const MATERIALIZE_PENDING_MSG =
  '安装事件已发出，Agent 记录尚未就绪，请稍后刷新组织视图或联系管理员。';

describe('MarketplaceHireRequestsService', () => {
  const companyId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const actorMember = { id: 'u1', roles: ['user'] as string[] };
  const actorAdmin = { id: 'u2', roles: ['user'] as string[] };

  function setup(membershipOk: boolean, manageOk: boolean) {
    const hireRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'hire-1' })),
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    const agentsQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      /** 第一次：重复安装检查；之后：物化轮询 */
      getOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'agent-new' }),
    };
    const agentsRepo = {
      createQueryBuilder: jest.fn(() => agentsQb),
      findOne: jest.fn().mockResolvedValue({ id: 'agent-new', companyId, metadata: {} }),
      save: jest.fn(async (x: Agent) => x),
    };
    const projectsRepo = { findOne: jest.fn() };
    const nodesRepo = { save: jest.fn(), find: jest.fn() };
    const subsRepo = { save: jest.fn() };
    const validator = {
      assertActiveCompanyMember: jest.fn(async () => {
        if (!membershipOk) {
          throw new ForbiddenException('仅公司成员可执行此操作');
        }
      }),
      assertCanManageAgents: jest.fn(async () => {
        if (!manageOk) {
          throw new ForbiddenException('仅公司 Owner/Admin 可执行此操作');
        }
      }),
      assertNodeExists: jest.fn(async () => ({
        id: 'node-1',
        type: 'agent',
        agentId: null,
        companyId,
      })),
      assertNodeHasNoAgent: jest.fn(),
    };
    const marketplaceService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'm1',
        name: 'Test SKU',
        agentCategory: 'employee',
        boundModelName: 'gpt-4o',
      }),
    };
    const catalogPricingService = {
      resolvePricingSnapshotForHire: jest.fn().mockResolvedValue({
        inputPricePerMillion: '1',
        outputPricePerMillion: '2',
        currency: 'CREDIT',
      }),
    };
    const agentPurchaseService = {
      purchase: jest.fn().mockResolvedValue({ ok: true, marketplaceAgentId: 'm1', eventId: 'evt-1' }),
    };
    const billing = {
      appendRecord: jest.fn().mockResolvedValue({ record: { id: 'br1' }, utilizationAfter: 0 }),
    };

    return {
      hireRepo,
      agentsRepo,
      agentsQb,
      validator,
      marketplaceService,
      agentPurchaseService,
      billing,
      catalogPricingService,
      projectsRepo,
      nodesRepo,
      subsRepo,
    };
  }

  async function getSvc(ctx: ReturnType<typeof setup>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceHireRequestsService,
        { provide: getRepositoryToken(MarketplaceHireRequest), useValue: ctx.hireRepo },
        { provide: getRepositoryToken(Agent), useValue: ctx.agentsRepo },
        { provide: getRepositoryToken(Project), useValue: ctx.projectsRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: ctx.nodesRepo },
        { provide: getRepositoryToken(MarketplaceAgentSubscription), useValue: ctx.subsRepo },
        { provide: AgentValidatorService, useValue: ctx.validator },
        { provide: MarketplaceService, useValue: ctx.marketplaceService },
        { provide: AgentPurchaseService, useValue: ctx.agentPurchaseService },
        { provide: BillingService, useValue: ctx.billing },
        { provide: MarketplaceCatalogPricingService, useValue: ctx.catalogPricingService },
      ],
    }).compile();
    return moduleRef.get(MarketplaceHireRequestsService);
  }

  it('create should persist pending row and trim requestedReason', async () => {
    const ctx = setup(true, false);
    const svc = await getSvc(ctx);
    await svc.create(
      companyId,
      {
        marketplaceAgentId: 'm1',
        organizationNodeId: 'node-1',
        requestedReason: '  hello  ',
      },
      actorMember,
    );
    expect(ctx.hireRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        marketplaceAgentId: 'm1',
        organizationNodeId: 'node-1',
        status: 'pending',
        requestedByUserId: actorMember.id,
        requestedReason: 'hello',
      }),
    );
    expect(ctx.hireRepo.save).toHaveBeenCalled();
    expect(ctx.marketplaceService.findOne).toHaveBeenCalledWith('m1');
  });

  it('create should map unique violation to conflict', async () => {
    const ctx = setup(true, false);
    ctx.hireRepo.save = jest.fn().mockRejectedValue({ code: '23505' });
    const svc = await getSvc(ctx);
    await expect(
      svc.create(
        companyId,
        { marketplaceAgentId: 'm1', organizationNodeId: 'node-1' },
        actorMember,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create should reject when node type is not hirable (agent/department/ceo/board)', async () => {
    const ctx = setup(true, false);
    ctx.validator.assertNodeExists = jest.fn(async () => ({
      id: 'n1',
      type: 'invalid_node_kind',
      agentId: null,
      companyId,
    })) as any;

    const svc = await getSvc(ctx);
    await expect(
      svc.create(
        companyId,
        {
          marketplaceAgentId: 'm1',
          organizationNodeId: 'n1',
        },
        actorMember,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create should reject when user is not company member', async () => {
    const ctx = setup(false, false);
    const svc = await getSvc(ctx);
    await expect(
      svc.create(companyId, { marketplaceAgentId: 'm1', organizationNodeId: 'node-1' }, actorMember),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne should throw when row missing', async () => {
    const ctx = setup(true, false);
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue(null);
    const svc = await getSvc(ctx);
    await expect(svc.findOne(companyId, 'missing-id', actorMember)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list should paginate and filter by status', async () => {
    const ctx = setup(true, false);
    const hireQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'h1' }], 5]),
    };
    ctx.hireRepo.createQueryBuilder = jest.fn(() => hireQb);
    const svc = await getSvc(ctx);
    const res = await svc.list(companyId, { page: 2, pageSize: 10, status: 'pending' }, actorMember);
    expect(res.items).toEqual([{ id: 'h1' }]);
    expect(res.total).toBe(5);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(10);
    expect(res.totalPages).toBe(1);
    expect(hireQb.skip).toHaveBeenCalledWith(10);
    expect(hireQb.take).toHaveBeenCalledWith(10);
    expect(hireQb.andWhere).toHaveBeenCalledWith('h.status = :status', { status: 'pending' });
  });

  it('approve should reject non-pending status', async () => {
    const ctx = setup(true, true);
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue({
      id: 'h1',
      companyId,
      status: 'completed',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    });

    const svc = await getSvc(ctx);
    await expect(svc.approve(companyId, 'h1', actorAdmin)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.agentPurchaseService.purchase).not.toHaveBeenCalled();
  });

  it('approve should call purchase with requireEventPublished', async () => {
    const ctx = setup(true, true);
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue({
      id: 'h1',
      companyId,
      status: 'pending',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
      employmentType: 'permanent',
      projectId: null,
    });

    const svc = await getSvc(ctx);
    await svc.approve(companyId, 'h1', actorAdmin);
    expect(ctx.hireRepo.update).toHaveBeenCalledWith(
      { id: 'h1', companyId, status: 'pending' },
      expect.objectContaining({ status: 'approved', reviewedByUserId: actorAdmin.id }),
    );
    expect(ctx.agentPurchaseService.purchase).toHaveBeenCalledWith(
      'm1',
      companyId,
      actorAdmin,
      'node-1',
      expect.objectContaining({
        skipDirectPurchaseCheck: true,
        requireEventPublished: true,
        employmentType: 'permanent',
      }),
    );
    expect(ctx.billing.appendRecord).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        recordType: 'other',
        agentId: 'agent-new',
        pricingSource: 'model_pricing',
        metadata: expect.objectContaining({ collaborationTokenBillingAligned: true }),
      }),
    );
  });

  it('approve should conflict when pending claim loses race', async () => {
    const ctx = setup(true, true);
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue({
      id: 'h1',
      companyId,
      status: 'pending',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    });
    ctx.hireRepo.update = jest.fn().mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });

    const svc = await getSvc(ctx);
    await expect(svc.approve(companyId, 'h1', actorAdmin)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.agentPurchaseService.purchase).not.toHaveBeenCalled();
  });

  it('approve should persist failed status when purchase throws', async () => {
    const ctx = setup(true, true);
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue({
      id: 'h1',
      companyId,
      status: 'pending',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    });
    ctx.agentPurchaseService.purchase = jest.fn().mockRejectedValue(new Error('mq down'));

    const svc = await getSvc(ctx);
    await expect(svc.approve(companyId, 'h1', actorAdmin)).rejects.toThrow('mq down');
    expect(ctx.hireRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'mq down',
      }),
    );
  });

  it('approve should set materialize-pending message when agent row never appears', async () => {
    jest.useFakeTimers();
    try {
      const ctx = setup(true, true);
      ctx.agentsQb.getOne.mockReset();
      ctx.agentsQb.getOne.mockResolvedValue(null);

      const pendingRow = {
        id: 'h1',
        companyId,
        status: 'pending',
        marketplaceAgentId: 'm1',
        organizationNodeId: 'n1',
      };
      const completedFromDb = {
        ...pendingRow,
        status: 'completed' as const,
        resultAgentId: null,
        errorMessage: MATERIALIZE_PENDING_MSG,
      };
      ctx.hireRepo.findOne = jest.fn().mockResolvedValueOnce(pendingRow).mockResolvedValueOnce(completedFromDb);

      const svc = await getSvc(ctx);
      const done = svc.approve(companyId, 'h1', actorAdmin);
      await jest.runAllTimersAsync();
      await done;

      expect(ctx.hireRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          resultAgentId: null,
          errorMessage: MATERIALIZE_PENDING_MSG,
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('reject should transition pending to rejected', async () => {
    const ctx = setup(true, true);
    const pending = {
      id: 'h1',
      companyId,
      status: 'pending',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    };
    const rejected = { ...pending, status: 'rejected' as const, rejectReason: '原因' };
    ctx.hireRepo.findOne = jest.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(rejected);
    ctx.hireRepo.update = jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

    const svc = await getSvc(ctx);
    const out = await svc.reject(companyId, 'h1', actorAdmin, '原因');
    expect(out.status).toBe('rejected');
    expect(ctx.hireRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('reject should cancel stalled approved row (no purchase_event_id)', async () => {
    const ctx = setup(true, true);
    const approved = {
      id: 'h1',
      companyId,
      status: 'approved',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    };
    const cancelled = {
      ...approved,
      status: 'rejected' as const,
      rejectReason: '处理中的安装已取消',
    };
    ctx.hireRepo.findOne = jest.fn().mockResolvedValueOnce(approved).mockResolvedValueOnce(cancelled);
    ctx.hireRepo.update = jest.fn().mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
    const stalledQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };
    ctx.hireRepo.createQueryBuilder = jest.fn(() => stalledQb);

    const svc = await getSvc(ctx);
    const out = await svc.reject(companyId, 'h1', actorAdmin);
    expect(out.status).toBe('rejected');
    expect(stalledQb.execute).toHaveBeenCalled();
  });

  it('reject should conflict when row is not pending or cancellable approved', async () => {
    const ctx = setup(true, true);
    const completed = {
      id: 'h1',
      companyId,
      status: 'completed',
      marketplaceAgentId: 'm1',
      organizationNodeId: 'n1',
    };
    ctx.hireRepo.findOne = jest.fn().mockResolvedValue(completed);
    ctx.hireRepo.update = jest.fn().mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
    const stalledQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };
    ctx.hireRepo.createQueryBuilder = jest.fn(() => stalledQb);

    const svc = await getSvc(ctx);
    await expect(svc.reject(companyId, 'h1', actorAdmin)).rejects.toBeInstanceOf(ConflictException);
  });
});
