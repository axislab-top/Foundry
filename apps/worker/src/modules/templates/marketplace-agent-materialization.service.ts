import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { AgentPurchasedEvent } from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

/** 与 API OrganizationNode.type 对齐 */
type OrganizationNodeType = 'board' | 'ceo' | 'department' | 'agent';
/** 与 API AgentRole 对齐 */
type AgentRole = 'ceo' | 'director' | 'board_member' | 'executor';

function roleFromNodeType(t: OrganizationNodeType | undefined | null): AgentRole {
  if (t === 'ceo') return 'ceo';
  if (t === 'department') return 'director';
  if (t === 'board') return 'board_member';
  return 'executor';
}

/**
 * 将 agent.purchased 中的 marketplace_agent 物化为 company 下的 Agent。
 * - llmModel / llmKeyId：若事件中带有安装期 Key 则写入；否则用商城 boundModelName，Key 留空由运行时 bindings 解析。
 */
@Injectable()
export class MarketplaceAgentMaterializationService {
  private readonly logger = new Logger(MarketplaceAgentMaterializationService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  async materializeFromAgentPurchased(event: AgentPurchasedEvent): Promise<void> {
    const actor = this.actor();
    const companyId = event.data.companyId;
    const marketplaceAgentId = event.data.marketplaceAgentId;
    const organizationNodeId = event.data.organizationNodeId;

    if (!organizationNodeId) {
      this.logger.warn('agent.purchased missing organizationNodeId; skipping materialization', {
        eventId: event.eventId,
        companyId,
        marketplaceAgentId,
      });
      return;
    }

    const marketplaceAgent = await this.rpc<{
      id: string;
      name: string;
      expertise: string | null;
      systemPrompt: string | null;
      recommendedSkills: unknown[] | null;
      boundModelName: string | null;
    }>('marketplace.agents.findOne', { id: marketplaceAgentId });

    const node = await this.rpc<{ id: string; type: OrganizationNodeType }>('organization.node.get', {
      companyId,
      actor,
      id: organizationNodeId,
    });

    const role = roleFromNodeType(node?.type);

    const snapModel =
      (event.data.assignedModelName && String(event.data.assignedModelName).trim()) ||
      (marketplaceAgent.boundModelName && String(marketplaceAgent.boundModelName).trim()) ||
      undefined;
    const snapKeyId =
      event.data.assignedLlmKeyId && String(event.data.assignedLlmKeyId).trim()
        ? String(event.data.assignedLlmKeyId).trim()
        : undefined;

    const createdAgent = await this.rpc<{ id: string }>('agents.create', {
      companyId,
      actor,
      data: {
        organizationNodeId,
        name: marketplaceAgent.name,
        role,
        expertise: marketplaceAgent.expertise ?? undefined,
        systemPrompt: marketplaceAgent.systemPrompt ?? undefined,
        llmModel: snapModel,
        llmKeyId: snapKeyId,
        metadata: {
          marketplaceAgentId,
          installedFromMarketplace: true,
          employmentType: event.data.employmentType,
          projectId: event.data.projectId,
        },
      },
    });

    // Bind Marketplace-recommended global Skills to the newly created company Agent.
    const recommendedNames = Array.isArray(marketplaceAgent.recommendedSkills)
      ? (marketplaceAgent.recommendedSkills.filter((x) => typeof x === 'string') as string[])
      : [];

    if (recommendedNames.length > 0) {
      const skillIds = await this.rpc<string[]>(
        'skills.resolveRequiredGlobalSkillIdsByNames',
        {
          names: recommendedNames,
          source: 'worker_agent_purchased_materialization',
          errorPrefix: `Marketplace Agent(${marketplaceAgentId}) 推荐技能缺失`,
        },
      );

      if (skillIds.length > 0) {
        const bindRes = await this.rpc<Record<string, unknown>>('agents.bindSkills', {
          companyId,
          actor,
          id: createdAgent.id,
          data: {
            skillIds,
          },
        });
        if (bindRes && typeof bindRes === 'object' && bindRes['outcome'] === 'pending_approval') {
          this.logger.warn({
            msg: 'marketplace_agent_skill_bind_pending_approval',
            companyId,
            agentId: createdAgent.id,
            approvalRequestId: bindRes['approvalRequestId'],
          });
        }
      }
    }
  }
}

