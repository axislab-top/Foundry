import { Injectable, Logger } from '@nestjs/common';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';
import { AgentSkillService } from './agent-skill.service.js';

/**
 * 可信引导：将平台「按角色默认」的全局技能先纳入租户目录（P13），再绑定到 Agent。
 * 单一入口，避免在 AgentsBootstrap 与其它引导路径复制 mount+bind 顺序。
 */
@Injectable()
export class BootstrapSkillCatalogService {
  private readonly logger = new Logger(BootstrapSkillCatalogService.name);

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly skillsService: SkillsService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly agentSkillService: AgentSkillService,
  ) {}

  /**
   * @param role 平台角色键，如 ceo / director / executor（与 {@link PlatformSettingsService#getEffectiveRoleDefaultGlobalSkillNames} 一致）
   */
  async ensureCompanyCatalogThenBindToAgent(
    companyId: string,
    agentId: string,
    role: string,
  ): Promise<{ expectedNames: string[]; resolvedSkillIds: string[]; missingNames: string[] }> {
    const names = await this.platformSettings.getEffectiveRoleDefaultGlobalSkillNames(role);
    return this.ensureCompanyCatalogThenBindSkillNames(companyId, agentId, names, 'bootstrap_role_default');
  }

  /**
   * 按显式 skill 名列表 mount + bind（executor 部门能力 / marketplace 推荐等）。
   * Bootstrap 路径对缺失的全局 skill 仅告警，不阻断公司创建。
   */
  async ensureCompanyCatalogThenBindSkillNames(
    companyId: string,
    agentId: string,
    names: string[],
    source: string,
  ): Promise<{ expectedNames: string[]; resolvedSkillIds: string[]; missingNames: string[] }> {
    const unique = [...new Set(names.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!unique.length) {
      return { expectedNames: [], resolvedSkillIds: [], missingNames: [] };
    }
    const { skillIds, missingNames } = await this.skillsService.resolveOptionalGlobalSkillIdsByNames(
      unique,
      { source: 'bootstrap_skill_catalog' },
    );
    if (missingNames.length > 0) {
      this.logger.warn('bootstrap_global_skills_missing', {
        companyId,
        agentId,
        source,
        missingNames,
      });
    }
    if (skillIds.length > 0) {
      await this.skillBindingValidator.mountPlatformGlobalSkillsOnBoard(companyId, skillIds);
    }
    if (skillIds.length > 0) {
      await this.agentSkillService.bindDefaultSkillsForAgent(agentId, companyId, skillIds, source);
    }
    return { expectedNames: unique, resolvedSkillIds: skillIds, missingNames };
  }
}
