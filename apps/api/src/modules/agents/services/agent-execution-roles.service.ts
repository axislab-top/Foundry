import { Injectable } from '@nestjs/common';
import { EffectiveSkillsService } from '../../skills/services/effective-skills.service.js';
import { SkillsService } from '../../skills/services/skills.service.js';

/** Agent 角色默认权限（与绑定 Skill 的 requiredPermissions 取并集）。 */
const ROLE_DEFAULT_EXECUTION_PERMISSIONS: Record<string, readonly string[]> = {
  ceo: ['read:organization', 'read:agents', 'tasks:assign'],
  director: ['read:organization'],
  executor: [],
  employee: [],
};

/**
 * Worker Skill 执行前解析有效权限角色（替代进程级 admin bypass）。
 */
@Injectable()
export class AgentExecutionRolesService {
  constructor(
    private readonly effectiveSkills: EffectiveSkillsService,
    private readonly skillsService: SkillsService,
  ) {}

  async getEffectiveExecutionRoles(agentId: string, companyId: string): Promise<string[]> {
    const ctx = await this.effectiveSkills.getDepartmentSharingContextForAgent({ agentId, companyId });
    const roleKey = String(ctx.role ?? '').trim().toLowerCase();
    const roleDefaults = ROLE_DEFAULT_EXECUTION_PERMISSIONS[roleKey] ?? [];

    const skillIds = await this.effectiveSkills.getEffectiveSkillIdsForAgent(agentId, companyId);
    if (!skillIds.length) {
      return [...new Set(roleDefaults)];
    }
    const rows = await this.skillsService.findByIdsForTenant(skillIds, companyId);
    const fromSkills = rows
      .filter((r) => r.isEnabled)
      .flatMap((r) => (Array.isArray(r.requiredPermissions) ? r.requiredPermissions : []))
      .map((p) => String(p ?? '').trim())
      .filter(Boolean);

    return [...new Set([...roleDefaults, ...fromSkills])];
  }
}
