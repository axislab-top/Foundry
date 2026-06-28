import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentValidatorService } from '../../agents/services/agent-validator.service.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { Project } from '../../projects/entities/project.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { CreateMarketplaceHireRequestDto } from '../dto/create-marketplace-hire-request.dto.js';
import { QueryMarketplaceHireRequestsDto } from '../dto/query-marketplace-hire-requests.dto.js';
import { MarketplaceHireRequest } from '../entities/marketplace-hire-request.entity.js';
import { AgentPurchaseService } from './agent-purchase.service.js';
import { MarketplaceService } from './marketplace.service.js';
import { BillingService } from '../../billing/services/billing.service.js';
import { MarketplaceCatalogPricingService } from './marketplace-catalog-pricing.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

const AGENT_MATERIALIZE_PENDING_MSG =
  '安装事件已发出，Agent 记录尚未就绪，请稍后刷新组织视图或联系管理员。';

const STALLED_APPROVAL_CANCELLED_REASON = '处理中的安装已取消';

@Injectable()
export class MarketplaceHireRequestsService {
  private readonly logger = new Logger(MarketplaceHireRequestsService.name);

  constructor(
    @InjectRepository(MarketplaceHireRequest)
    private readonly hireRepo: Repository<MarketplaceHireRequest>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly validator: AgentValidatorService,
    private readonly marketplaceService: MarketplaceService,
    private readonly agentPurchaseService: AgentPurchaseService,
    private readonly billing: BillingService,
    private readonly catalogPricingService: MarketplaceCatalogPricingService,
  ) {}

  async create(companyId: string, dto: CreateMarketplaceHireRequestDto, actor: Actor): Promise<MarketplaceHireRequest> {
    await this.validator.assertActiveCompanyMember(companyId, actor);
    await this.marketplaceService.findOne(dto.marketplaceAgentId);
    const node = await this.validator.assertNodeExists(dto.organizationNodeId, companyId);
    if (!['agent', 'department', 'ceo', 'board'].includes(node.type)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '招聘安装需选择 agent/department/ceo/board 类型的组织节点',
      });
    }
    if (node.type === 'agent') {
      this.validator.assertNodeHasNoAgent(node);
      await this.assertNoDuplicateInstalledAgent(companyId, dto.organizationNodeId, dto.marketplaceAgentId);
    }

    const employmentType = dto.employmentType ?? 'permanent';
    const projectId = dto.projectId ?? null;
    if (employmentType === 'temporary') {
      if (!projectId) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '临时项目雇佣必须绑定 projectId',
        });
      }
      const project = await this.projectsRepo.findOne({ where: { id: projectId, companyId } });
      if (!project) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'projectId 不存在或不属于当前公司',
        });
      }
    }

    try {
      const row = this.hireRepo.create({
        companyId,
        marketplaceAgentId: dto.marketplaceAgentId,
        organizationNodeId: dto.organizationNodeId,
        employmentType,
        projectId: employmentType === 'temporary' ? projectId : null,
        status: 'pending',
        requestedByUserId: actor.id,
        requestedReason: dto.requestedReason?.trim() || null,
      });
      return await this.hireRepo.save(row);
    } catch (e: any) {
      if (String(e?.code ?? '') === '23505') {
        throw new ConflictException({
          code: ErrorCode.RESOURCE_CONFLICT,
          message: '该岗位与组织节点已存在待审批申请',
        });
      }
      throw e;
    }
  }

  async list(companyId: string, query: QueryMarketplaceHireRequestsDto, actor: Actor) {
    await this.validator.assertActiveCompanyMember(companyId, actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.hireRepo.createQueryBuilder('h').where('h.company_id = :companyId', { companyId });
    if (query.status) {
      qb.andWhere('h.status = :status', { status: query.status });
    }
    qb.orderBy('h.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(companyId: string, id: string, actor: Actor): Promise<MarketplaceHireRequest> {
    await this.validator.assertActiveCompanyMember(companyId, actor);
    const row = await this.hireRepo.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '招聘申请不存在',
      });
    }
    return row;
  }

  async approve(companyId: string, id: string, actor: Actor): Promise<MarketplaceHireRequest> {
    await this.validator.assertCanManageAgents(companyId, actor);
    const snapshot = await this.requireHireRow(companyId, id);
    if (snapshot.status !== 'pending') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '仅待审批的申请可通过',
      });
    }
    const product = await this.marketplaceService.findOne(snapshot.marketplaceAgentId);
    const installNodeId = await this.resolveInstallNodeId(
      companyId,
      snapshot.organizationNodeId,
      product.agentCategory === 'department_head',
    );
    await this.assertNoDuplicateInstalledAgent(companyId, installNodeId, snapshot.marketplaceAgentId);
    if (snapshot.employmentType === 'temporary') {
      if (!snapshot.projectId) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '临时项目雇佣缺少 projectId（数据不一致）',
        });
      }
      const task = await this.tasksRepo.findOne({ where: { id: snapshot.projectId, companyId } as any });
      if (!task) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '临时项目雇佣绑定的 projectId 不存在或不属于当前公司',
        });
      }
    }

    const reviewedAt = new Date();
    const claimed = await this.hireRepo.update(
      { id, companyId, status: 'pending' },
      { status: 'approved', reviewedByUserId: actor.id, reviewedAt },
    );
    if (!claimed.affected) {
      const cur = await this.hireRepo.findOne({ where: { id, companyId } });
      if (!cur) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '招聘申请不存在',
        });
      }
      throw new ConflictException({
        code: ErrorCode.RESOURCE_CONFLICT,
        message: '申请状态已变更，请刷新后重试',
      });
    }

    const row: MarketplaceHireRequest = {
      ...snapshot,
      status: 'approved',
      organizationNodeId: installNodeId,
      reviewedByUserId: actor.id,
      reviewedAt,
    };

    try {
      const purchase = await this.agentPurchaseService.purchase(
        row.marketplaceAgentId,
        companyId,
        actor,
        row.organizationNodeId,
        {
          skipDirectPurchaseCheck: true,
          requireEventPublished: true,
          employmentType: row.employmentType,
          projectId: row.projectId ?? undefined,
        },
      );
      row.purchaseEventId = purchase.eventId ?? null;
      row.status = 'completed';
      row.rejectReason = null;

      const resultAgentId = await this.pollResultAgentId(
        companyId,
        row.organizationNodeId,
        row.marketplaceAgentId,
      );
      row.resultAgentId = resultAgentId;
      row.errorMessage = resultAgentId ? null : AGENT_MATERIALIZE_PENDING_MSG;

      await this.hireRepo.save(row);

      if (row.resultAgentId) {
        try {
          const modelSnap = await this.catalogPricingService.resolvePricingSnapshotForHire(
            product,
            companyId,
          );
          await this.billing.appendRecord(companyId, {
            recordType: 'other',
            agentId: row.resultAgentId,
            cost: 0,
            isNominal: true,
            idempotencyKey: `marketplace:hire_pricing_anchor:${companyId}:${id}`,
            pricingSnapshotJson: {
              ...(modelSnap ?? { reason: 'no_model_pricing' }),
              marketplaceAgentId: row.marketplaceAgentId,
            },
            pricingSource: 'model_pricing',
            metadata: {
              source: 'marketplace_hire_completed',
              collaborationTokenBillingAligned: true,
              hireRequestId: id,
              marketplaceAgentId: row.marketplaceAgentId,
              organizationNodeId: row.organizationNodeId,
              employmentType: row.employmentType,
              projectId: row.projectId,
            },
          });
        } catch (billErr: unknown) {
          this.logger.warn('marketplace hire billing anchor failed (install still completed)', {
            companyId,
            hireRequestId: id,
            message: billErr instanceof Error ? billErr.message : String(billErr),
          });
        }
      }

      return (await this.hireRepo.findOne({ where: { id, companyId } })) ?? row;
    } catch (e: any) {
      row.status = 'failed';
      row.errorMessage = e?.message ?? String(e);
      row.rejectReason = null;
      await this.hireRepo.save(row);
      throw e;
    }
  }

  async reject(companyId: string, id: string, actor: Actor, rejectReason?: string): Promise<MarketplaceHireRequest> {
    await this.validator.assertCanManageAgents(companyId, actor);
    await this.requireHireRow(companyId, id);

    const reviewedAt = new Date();
    const trimmed = rejectReason?.trim() || null;
    const upd = await this.hireRepo.update(
      { id, companyId, status: 'pending' },
      {
        status: 'rejected',
        reviewedByUserId: actor.id,
        reviewedAt,
        rejectReason: trimmed,
      },
    );
    if (upd.affected) {
      return this.requireHireRow(companyId, id);
    }

    const stalled = await this.hireRepo
      .createQueryBuilder()
      .update(MarketplaceHireRequest)
      .set({
        status: 'rejected',
        reviewedByUserId: actor.id,
        reviewedAt,
        rejectReason: trimmed ?? STALLED_APPROVAL_CANCELLED_REASON,
        errorMessage: null,
      })
      .where('id = :id AND company_id = :companyId AND status = :st', {
        id,
        companyId,
        st: 'approved',
      })
      .andWhere('purchase_event_id IS NULL')
      .execute();

    if (stalled.affected) {
      return this.requireHireRow(companyId, id);
    }

    const cur = await this.hireRepo.findOne({ where: { id, companyId } });
    if (!cur) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '招聘申请不存在',
      });
    }
    throw new ConflictException({
      code: ErrorCode.RESOURCE_CONFLICT,
      message: '当前状态不可驳回或取消（仅待审批、或处理中且尚未记录购买事件时可操作）',
    });
  }

  private async requireHireRow(companyId: string, id: string): Promise<MarketplaceHireRequest> {
    const row = await this.hireRepo.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '招聘申请不存在',
      });
    }
    return row;
  }

  private async assertNoDuplicateInstalledAgent(
    companyId: string,
    organizationNodeId: string,
    marketplaceAgentId: string,
  ): Promise<void> {
    const dup = await this.agentsRepo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.organization_node_id = :organizationNodeId', { organizationNodeId })
      .andWhere(`COALESCE(a.metadata->>'installedFromMarketplace','') = 'true'`)
      .andWhere(`a.metadata->>'marketplaceAgentId' = :mid`, { mid: marketplaceAgentId })
      .getOne();
    if (dup) {
      throw new ConflictException({
        code: ErrorCode.RESOURCE_CONFLICT,
        message: '该组织节点已安装同一商城 Agent，无需重复招聘',
      });
    }
  }

  private async pollResultAgentId(
    companyId: string,
    organizationNodeId: string,
    marketplaceAgentId: string,
  ): Promise<string | null> {
    for (let i = 0; i < 15; i += 1) {
      const row = await this.agentsRepo
        .createQueryBuilder('a')
        .where('a.company_id = :companyId', { companyId })
        .andWhere('a.organization_node_id = :organizationNodeId', { organizationNodeId })
        .andWhere(`COALESCE(a.metadata->>'installedFromMarketplace','') = 'true'`)
        .andWhere(`a.metadata->>'marketplaceAgentId' = :mid`, { mid: marketplaceAgentId })
        .orderBy('a.created_at', 'DESC')
        .getOne();
      if (row) {
        return row.id;
      }
      await this.delay(200);
    }
    return null;
  }

  private async resolveInstallNodeId(
    companyId: string,
    requestedNodeId: string,
    isDepartmentDirectorCategory: boolean,
  ): Promise<string> {
    const requested = await this.validator.assertNodeExists(requestedNodeId, companyId);
    if (requested.type === 'agent') {
      if (!requested.agentId) {
        return requested.id;
      }
      if (!requested.parentId) {
        throw new ConflictException({
          code: ErrorCode.RESOURCE_CONFLICT,
          message: '目标 agent 节点已被占用，且无法自动分配兄弟节点，请改选部门节点',
        });
      }
      return this.createChildAgentNode(companyId, requested.parentId);
    }
    if (requested.type === 'department') {
      if (isDepartmentDirectorCategory) {
        if (requested.agentId) {
          throw new ConflictException({
            code: ErrorCode.RESOURCE_CONFLICT,
            message: '目标部门已绑定主管，请改选其他部门或先解绑原主管',
          });
        }
        return requested.id;
      }
      return this.createChildAgentNode(companyId, requested.id);
    }
    if (requested.type === 'ceo' || requested.type === 'board') {
      return this.createChildAgentNode(companyId, requested.id);
    }
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: '当前节点类型不支持安装 Agent',
    });
  }

  private async createChildAgentNode(companyId: string, parentId: string): Promise<string> {
    const siblings = await this.nodesRepo.find({
      where: { companyId, parentId },
      select: ['order'],
      order: { order: 'DESC' },
      take: 1,
    });
    const nextOrder = (siblings[0]?.order ?? -1) + 1;
    const node = await this.nodesRepo.save(
      this.nodesRepo.create({
        companyId,
        parentId,
        type: 'agent',
        name: `Agent 节点 ${nextOrder + 1}`,
        description: null,
        order: nextOrder,
        metadata: { autoProvisioned: true, source: 'marketplace_hire_request' },
      }),
    );
    return node.id;
  }

  /** Node 下 unref，减轻测试/进程退出时定时器挂住 worker */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const handle = setTimeout(resolve, ms);
      const t = handle as NodeJS.Timeout;
      if (typeof t.unref === 'function') {
        t.unref();
      }
    });
  }
}
