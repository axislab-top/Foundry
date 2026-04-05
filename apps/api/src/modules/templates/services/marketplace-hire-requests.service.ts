import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentValidatorService } from '../../agents/services/agent-validator.service.js';
import { CreateMarketplaceHireRequestDto } from '../dto/create-marketplace-hire-request.dto.js';
import { QueryMarketplaceHireRequestsDto } from '../dto/query-marketplace-hire-requests.dto.js';
import { MarketplaceHireRequest } from '../entities/marketplace-hire-request.entity.js';
import { AgentPurchaseService } from './agent-purchase.service.js';
import { MarketplaceService } from './marketplace.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

const AGENT_MATERIALIZE_PENDING_MSG =
  '安装事件已发出，Agent 记录尚未就绪，请稍后刷新组织视图或联系管理员。';

const STALLED_APPROVAL_CANCELLED_REASON = '处理中的安装已取消';

@Injectable()
export class MarketplaceHireRequestsService {
  constructor(
    @InjectRepository(MarketplaceHireRequest)
    private readonly hireRepo: Repository<MarketplaceHireRequest>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    private readonly validator: AgentValidatorService,
    private readonly marketplaceService: MarketplaceService,
    private readonly agentPurchaseService: AgentPurchaseService,
  ) {}

  async create(companyId: string, dto: CreateMarketplaceHireRequestDto, actor: Actor): Promise<MarketplaceHireRequest> {
    await this.validator.assertActiveCompanyMember(companyId, actor);
    await this.marketplaceService.findOne(dto.marketplaceAgentId);
    const node = await this.validator.assertNodeExists(dto.organizationNodeId, companyId);
    if (node.type !== 'agent') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '招聘安装需选择类型为 agent 的组织节点',
      });
    }
    this.validator.assertNodeHasNoAgent(node);
    await this.assertNoDuplicateInstalledAgent(companyId, dto.organizationNodeId, dto.marketplaceAgentId);

    try {
      const row = this.hireRepo.create({
        companyId,
        marketplaceAgentId: dto.marketplaceAgentId,
        organizationNodeId: dto.organizationNodeId,
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
    await this.assertNoDuplicateInstalledAgent(
      companyId,
      snapshot.organizationNodeId,
      snapshot.marketplaceAgentId,
    );
    const node = await this.validator.assertNodeExists(snapshot.organizationNodeId, companyId);
    this.validator.assertNodeHasNoAgent(node);

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
      reviewedByUserId: actor.id,
      reviewedAt,
    };

    try {
      const purchase = await this.agentPurchaseService.purchase(
        row.marketplaceAgentId,
        companyId,
        actor,
        row.organizationNodeId,
        { skipDirectPurchaseCheck: true, requireEventPublished: true },
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
