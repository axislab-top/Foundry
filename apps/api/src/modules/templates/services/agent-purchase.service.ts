import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { AgentPurchasedEvent } from '@contracts/events';
import { DataSource, In, Repository } from 'typeorm';
import { LlmKey } from '../../llm-keys/entities/llm-key.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgentKeyBinding } from '../entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceService } from './marketplace.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

export interface MarketplacePurchaseOptions {
  /** 审批通过后的内部调用，跳过「仅平台管理员可直购」校验 */
  skipDirectPurchaseCheck?: boolean;
  /** 为 true 时：MQ 发布失败则抛错（招聘审批等强一致场景），且不增加 usage_count */
  requireEventPublished?: boolean;
  /** Hiring path discriminator (permanent vs project-scoped temporary). */
  employmentType?: 'permanent' | 'temporary';
  /** Project binding for temporary hires (currently aligned to tasks.id). */
  projectId?: string;
}

function isPlatformAdmin(actor: Actor): boolean {
  return !!actor.roles?.some((r) => r === 'admin' || r === 'superadmin');
}

/**
 * Agent 商城购买（当前：免费商品直接记一次购买事件；付费留待 Billing 集成）。
 */
@Injectable()
export class AgentPurchaseService {
  private readonly logger = new Logger(AgentPurchaseService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly marketplaceService: MarketplaceService,
    private readonly messagingService: MessagingService,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly bindingsRepo: Repository<MarketplaceAgentKeyBinding>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly assignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    @InjectRepository(LlmKey)
    private readonly llmKeysRepo: Repository<LlmKey>,
  ) {}

  async purchase(
    marketplaceAgentId: string,
    companyId: string,
    actor: Actor,
    organizationNodeId: string,
    options?: MarketplacePurchaseOptions,
  ): Promise<{ ok: boolean; marketplaceAgentId: string; eventId?: string }> {
    if (!companyId) {
      throw new BadRequestException({ message: '缺少公司上下文，无法安装 Agent' });
    }

    const installOrganizationNodeId =
      typeof organizationNodeId === 'string' ? organizationNodeId.trim() : '';
    if (!installOrganizationNodeId) {
      throw new BadRequestException({
        message:
          '安装商城 Agent 必须指定组织节点 organizationNodeId（通常为 type=agent 且未绑定 agentId 的槽位）',
      });
    }

    if (!options?.skipDirectPurchaseCheck && !isPlatformAdmin(actor)) {
      throw new ForbiddenException({
        message: '请通过公司招聘申请流程安装商城 Agent；直购仅限平台管理员',
      });
    }

    const agent = await this.marketplaceService.findOne(marketplaceAgentId);

    const keyAlloc = await this.ensureMarketplaceAssignment(marketplaceAgentId, companyId);

    const eventId = randomUUID();
    try {
      const event: AgentPurchasedEvent = {
        eventId,
        eventType: 'agent.purchased',
        aggregateId: marketplaceAgentId,
        aggregateType: 'marketplace_agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          marketplaceAgentId,
          companyId,
          organizationNodeId: installOrganizationNodeId,
          employmentType: options?.employmentType,
          projectId: options?.projectId,
          ...(keyAlloc.assignedLlmKeyId && keyAlloc.assignedModelName
            ? {
                assignedLlmKeyId: keyAlloc.assignedLlmKeyId,
                assignedModelName: keyAlloc.assignedModelName,
              }
            : {}),
          purchasedBy: actor.id,
          purchasedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'agent.purchased',
        persistent: true,
      });
      await this.marketplaceService.incrementUsage(marketplaceAgentId);
      return { ok: true, marketplaceAgentId, eventId };
    } catch (e: any) {
      this.logger.error('Failed to publish agent.purchased', {
        marketplaceAgentId,
        error: e?.message,
      });
      if (options?.requireEventPublished) {
        throw new ServiceUnavailableException({
          message: '无法发布安装事件（agent.purchased），请稍后重试或联系管理员',
        });
      }
    }

    return { ok: true, marketplaceAgentId };
  }

  /**
   * 确保存在公司级商城安装行：记录 subscription/embedding 元数据，不再独占写入 assigned_llm_key_id。
   * 运行时由 agents.llmKeyPoolCandidates + Worker acquire 按最新 bindings 解析。
   */
  private async ensureMarketplaceAssignment(
    marketplaceAgentId: string,
    companyId: string,
  ): Promise<{ assignedLlmKeyId?: string; assignedModelName?: string }> {
    return await this.dataSource.transaction(async (manager) => {
      const assignments = manager.getRepository(CompanyMarketplaceAgentKeyAssignment);
      const bindings = manager.getRepository(MarketplaceAgentKeyBinding);
      const llmKeys = manager.getRepository(LlmKey);

      const existing = await assignments.findOne({
        where: { companyId, marketplaceAgentId },
      });
      if (existing) {
        if (existing.preferredLlmKeyId) {
          const pk = await llmKeys.findOne({ where: { id: existing.preferredLlmKeyId } });
          if (pk?.isActive) {
            return { assignedLlmKeyId: pk.id, assignedModelName: pk.modelName };
          }
        }
        if (existing.assignedLlmKeyId) {
          const key = await llmKeys.findOne({ where: { id: existing.assignedLlmKeyId } });
          if (!key) {
            throw new BadRequestException('已分配的 LLM Key 不存在，请联系管理员处理');
          }
          return { assignedLlmKeyId: existing.assignedLlmKeyId, assignedModelName: key.modelName };
        }
        return {};
      }

      const rows = await bindings.find({
        where: { marketplaceAgentId },
        order: { sortOrder: 'ASC' },
      });
      if (!rows.length) {
        throw new BadRequestException('该 Agent 商品未绑定任何可用 Key');
      }

      const assignedEmbeddingModelId = rows.map((r) => r.embeddingModelId).find((x) => !!x) ?? null;

      const candidateIds = rows.map((r) => r.llmKeyId);
      const keys = candidateIds.length ? await llmKeys.find({ where: { id: In(candidateIds) } as any }) : [];
      const keyMap = new Map(keys.map((k) => [k.id, k] as const));

      const orderedCandidates = rows
        .map((r) => keyMap.get(r.llmKeyId))
        .filter((k): k is LlmKey => !!k)
        .filter((k) => k.isActive);

      if (!orderedCandidates.length) {
        throw new BadRequestException('该 Agent 商品绑定的 Key 均不可用（inactive 或不存在）');
      }

      const agent = await this.marketplaceService.findOne(marketplaceAgentId);
      const boundModelName = agent.boundModelName?.trim() || null;

      const modelCandidates = boundModelName
        ? orderedCandidates.filter((k) => k.modelName === boundModelName)
        : orderedCandidates;

      if (!modelCandidates.length) {
        throw new BadRequestException('该 Agent 商品绑定的 Key 与指定模型不匹配或均不可用');
      }

      await assignments
        .createQueryBuilder()
        .insert()
        .into(CompanyMarketplaceAgentKeyAssignment)
        .values({
          companyId,
          marketplaceAgentId,
          assignedLlmKeyId: null,
          preferredLlmKeyId: null,
          assignedEmbeddingModelId,
        })
        .orIgnore()
        .execute();

      const row = await assignments.findOne({ where: { companyId, marketplaceAgentId } });
      if (!row) {
        throw new BadRequestException('无法写入商城安装记录，请重试');
      }

      return {};
    });
  }
}
