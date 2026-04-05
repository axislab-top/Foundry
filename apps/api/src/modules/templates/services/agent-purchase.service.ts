import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
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
    organizationNodeId?: string,
    options?: MarketplacePurchaseOptions,
  ): Promise<{ ok: boolean; marketplaceAgentId: string; eventId?: string }> {
    if (!companyId) {
      throw new BadRequestException({ message: '缺少公司上下文，无法安装 Agent' });
    }

    if (!options?.skipDirectPurchaseCheck && !isPlatformAdmin(actor)) {
      throw new ForbiddenException({
        message: '请通过公司招聘申请流程安装商城 Agent；直购仅限平台管理员',
      });
    }

    const agent = await this.marketplaceService.findOne(marketplaceAgentId);

    if (agent.pricingModel !== 'free' || agent.priceCents > 0) {
      throw new UnprocessableEntityException({
        message: '付费 Agent 需先完成支付与计费集成',
      });
    }

    const { assignedLlmKeyId, assignedModelName } = await this.allocateFixedKeyForCompany(
      marketplaceAgentId,
      companyId,
    );

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
          organizationNodeId,
          assignedLlmKeyId,
          assignedModelName,
          purchasedBy: actor.id,
          pricingModel: agent.pricingModel,
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

  private async allocateFixedKeyForCompany(
    marketplaceAgentId: string,
    companyId: string,
  ): Promise<{ assignedLlmKeyId: string; assignedModelName: string }> {
    return await this.dataSource.transaction(async (manager) => {
      const assignments = manager.getRepository(CompanyMarketplaceAgentKeyAssignment);
      const bindings = manager.getRepository(MarketplaceAgentKeyBinding);
      const llmKeys = manager.getRepository(LlmKey);

      const existing = await assignments.findOne({
        where: { companyId, marketplaceAgentId },
      });
      if (existing) {
        const key = await llmKeys.findOne({ where: { id: existing.assignedLlmKeyId } });
        if (!key) {
          throw new BadRequestException('已分配的 LLM Key 不存在，请联系管理员处理');
        }
        return { assignedLlmKeyId: existing.assignedLlmKeyId, assignedModelName: key.modelName };
      }

      // 读商品绑定的 key 优先级列表（跨商品 key 不可复用由 uq_llm_key_id 保证）
      const rows = await bindings.find({
        where: { marketplaceAgentId },
        order: { sortOrder: 'ASC' },
      });
      if (!rows.length) {
        throw new BadRequestException('该 Agent 商品未绑定任何可用 Key');
      }

      // 获取候选 key 元信息，用于校验 modelName 且过滤 inactive
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

      // 若商品绑定了模型，则强制 key.modelName 必须匹配
      const agent = await this.marketplaceService.findOne(marketplaceAgentId);
      const boundModelName = agent.boundModelName?.trim() || null;

      const modelCandidates = boundModelName
        ? orderedCandidates.filter((k) => k.modelName === boundModelName)
        : orderedCandidates;

      if (!modelCandidates.length) {
        throw new BadRequestException('该 Agent 商品绑定的 Key 与指定模型不匹配或均不可用');
      }

      // 并发安全：尝试按优先级插入分配记录；若 assigned_llm_key_id 唯一冲突则试下一个
      for (const k of modelCandidates) {
        try {
          const saved = await assignments.save(
            assignments.create({
              companyId,
              marketplaceAgentId,
              assignedLlmKeyId: k.id,
            }),
          );
          return { assignedLlmKeyId: saved.assignedLlmKeyId, assignedModelName: k.modelName };
        } catch (e: any) {
          const code = String(e?.code ?? '');
          if (code === '23505') {
            // unique violation：该 key 已被其他公司占用，继续尝试下一把
            continue;
          }
          throw e;
        }
      }

      throw new BadRequestException('该 Agent 商品已无可分配的 Key（可能已全部被占用）');
    });
  }
}
