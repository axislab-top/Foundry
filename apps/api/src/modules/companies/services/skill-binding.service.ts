import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { CEO_SKILL_LAYERS, normalizeCeoLayerConfig } from '@foundry/skills';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { AgentSkillService } from '../../agents/services/agent-skill.service.js';

type SkillBindingValidatorPort = Pick<
  SkillBindingValidatorService,
  'mountPlatformGlobalSkillsOnBoard' | 'validateSkillsBelongToCompany'
>;

type AgentSkillPort = Pick<
  AgentSkillService,
  'bindDefaultSkillsForAgent' | 'registerMcpToolsFromSkills' | 'refreshMcpBindingsForAgent'
>;

/**
 * CEO 三层 `ceo_layer_config` → `agent_skills` 同步（按层读取 skillIds，并集后增量绑定）。
 */
@Injectable()
export class SkillBindingService {
  constructor(
    @Inject(forwardRef(() => SkillBindingValidatorService))
    private readonly skillBindingValidator: SkillBindingValidatorPort,
    @Inject(forwardRef(() => AgentSkillService))
    private readonly agentSkillService: AgentSkillPort,
  ) {}

  async bindSkillsToAgent(
    companyId: string,
    agentId: string,
    skillIds: string[],
    source: string,
  ): Promise<void> {
    await this.agentSkillService.bindDefaultSkillsForAgent(agentId, companyId, skillIds, source);
  }

  /**
   * 将三层配置中的 skillIds 同步到 CEO Agent：**只补缺**（不删除 Agent 上已有绑定）。
   * 三层 Skill 配置从统一 Skill 库选取，同一 Skill 可在 classifier/light/heavy 多层重复出现。
   */
  async syncSkillsFromLayerConfig(
    companyId: string,
    agentId: string,
    layerConfig: Record<string, unknown>,
  ): Promise<void> {
    const norm = normalizeCeoLayerConfig(layerConfig);
    const union = new Set<string>();
    for (const layer of CEO_SKILL_LAYERS) {
      const raw = norm[layer] as Record<string, unknown> | undefined;
      const ids = Array.isArray(raw?.skillIds)
        ? (raw.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      for (const id of ids) {
        union.add(id);
      }
    }
    // replay 层 skillIds 在 strategy.contextPolicy.replay，不在 CEO_SKILL_LAYERS
    const strategy = norm.strategy as Record<string, unknown> | undefined;
    const contextPolicy = strategy?.contextPolicy as Record<string, unknown> | undefined;
    const replay = contextPolicy?.replay as Record<string, unknown> | undefined;
    const replaySkillIds = Array.isArray(replay?.skillIds)
      ? (replay.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    for (const id of replaySkillIds) {
      union.add(id);
    }
    const list = [...union];
    if (!list.length) {
      return;
    }
    await this.skillBindingValidator.mountPlatformGlobalSkillsOnBoard(companyId, list);
    await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, list, {
      source: 'skill_binding.syncSkillsFromLayerConfig',
    });
    await this.agentSkillService.bindDefaultSkillsForAgent(
      agentId,
      companyId,
      list,
      'ceo_layer_config_sync',
    );

    // Force per-layer MCP bindings refresh from skill configuration.
    // Even if a layer has empty skillIds, registerMcpToolsFromSkills clears stale in-memory registrations.
    for (const layer of CEO_SKILL_LAYERS) {
      const raw = norm[layer] as Record<string, unknown> | undefined;
      const layerIds = Array.isArray(raw?.skillIds)
        ? (raw.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      await this.agentSkillService.registerMcpToolsFromSkills(companyId, agentId, layerIds, layer);
    }

    // Keep null-layer bindings aligned with union skill bindings.
    await this.agentSkillService.refreshMcpBindingsForAgent(companyId, agentId);
  }
}
