import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { SkillToolSnapshot } from '@contracts/events';
import {
  buildEffectiveOpenAiTools,
  snapshotsIncludePlanABindings,
  type OpenAiFunctionTool,
  type SkillCatalogEntry,
  ToolRegistry,
} from '@service/ai';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { CompanyToolsetResolverService } from '../../agents/services/company-toolset-resolver.service.js';

export type AgentDirectSkillToolsPack = {
  tools: OpenAiFunctionTool[];
  allowedToolNames: Set<string>;
  capabilitySkillIds: string[];
  skillCatalog: SkillCatalogEntry[];
  boundMcpToolNames: string[];
  skillCount: number;
  /** tool 列表含 foundry.tool_catalog（Skill 过多时 progressive disclosure） */
  usesToolCatalog: boolean;
  progressiveDisclosure: boolean;
};

@Injectable()
export class AgentDirectSkillToolsService {
  private readonly logger = new Logger(AgentDirectSkillToolsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistry,
    private readonly companyToolsets: CompanyToolsetResolverService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async build(params: {
    companyId: string;
    agentId: string;
    fast?: boolean;
  }): Promise<AgentDirectSkillToolsPack> {
    const companyId = String(params.companyId ?? '').trim();
    const agentId = String(params.agentId ?? '').trim();
    const empty: AgentDirectSkillToolsPack = {
      tools: [],
      allowedToolNames: new Set(),
      capabilitySkillIds: [],
      skillCatalog: [],
      boundMcpToolNames: [],
      skillCount: 0,
      usesToolCatalog: false,
      progressiveDisclosure: this.config.isSkillProgressiveDisclosureEnabled(),
    };
    if (!companyId || !agentId) return empty;

    const hydrated = await firstValueFrom(
      this.apiRpcInteractive
        .send<{ skillIds?: string[]; skills?: SkillToolSnapshot[] }>('agents.effectiveSkillSnapshots', {
          companyId,
          actor: this.workerActor(),
          id: agentId,
        })
        .pipe(timeout({ first: this.config.getApiRpcTimeoutMs() })),
    ).catch((e: unknown) => {
      this.logger.warn('foundry.direct_agent.skills.hydrate_failed', {
        companyId,
        agentId,
        fast: params.fast === true,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    });

    const skills = Array.isArray(hydrated?.skills) ? hydrated.skills : [];
    const rawIds: string[] = Array.isArray(hydrated?.skillIds)
      ? hydrated.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean)
      : skills.map((s) => String(s.id ?? '').trim()).filter(Boolean);
    const capabilitySkillIds = [...new Set(rawIds)];

    if (skills.length && snapshotsIncludePlanABindings(skills)) {
      this.registry.setAgentTools(companyId, agentId, skills);
    }

    if (!skills.length) {
      return empty;
    }

    const enabledToolsets = await this.companyToolsets.getEnabledToolsets(companyId);
    const progressiveDisclosure = this.config.isSkillProgressiveDisclosureEnabled();
    const built = buildEffectiveOpenAiTools(this.registry, {
      snapshots: skills,
      enabledToolsets,
      progressiveDisclosure,
      toolSearch: {
        enabled: this.config.isToolSearchEnabled(),
        threshold: this.config.getToolSearchThreshold(),
      },
    });

    const allowedToolNames = new Set(
      built.tools.map((t) => String(t.function?.name ?? '').trim()).filter(Boolean),
    );
    const usesToolCatalog = allowedToolNames.has('foundry.tool_catalog');

    this.logger.log('foundry.direct_agent.skills.hydrate', {
      companyId,
      agentId,
      fast: params.fast === true,
      skillCount: skills.length,
      toolCount: built.tools.length,
      capabilitySkillIds: capabilitySkillIds.length,
      progressiveDisclosure,
      usesToolCatalog,
    });

    return {
      tools: built.tools,
      allowedToolNames,
      capabilitySkillIds,
      skillCatalog: built.skillCatalog,
      boundMcpToolNames: built.boundMcpToolNames,
      skillCount: skills.length,
      usesToolCatalog,
      progressiveDisclosure,
    };
  }
}
