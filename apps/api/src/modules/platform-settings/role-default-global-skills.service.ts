import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS,
  getDefaultGlobalSkillNamesForRole,
} from '../skills/default-skills.js';
import { PlatformSetting } from './entities/platform-setting.entity.js';

/** platform_settings.key — JSON 形如 { director: ["echo"], ceo: [...] }，缺的键走代码内置默认 */
export const ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY = 'skills.defaultGlobalNamesByRole';

/**
 * 平台「按角色默认全局 Skill 名」读写，独立于 {@link PlatformSettingsService}，
 * 避免 skills 模块经 platform-settings → ceo-layer-config 形成 ESM 循环依赖。
 */
@Injectable()
export class RoleDefaultGlobalSkillsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  /**
   * 读取 DB 中为某角色配置的「全局 skill name」列表；若无覆盖则回落到 {@link getDefaultGlobalSkillNamesForRole}。
   * 若覆盖键存在且数组为空，表示显式不要求默认绑定任何全局技能。
   */
  async getEffectiveRoleDefaultGlobalSkillNames(role: string): Promise<string[]> {
    const row = await this.repo.findOne({ where: { key: ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY } });
    const map = (row?.value ?? {}) as Record<string, unknown>;
    const r = String(role ?? '').trim();
    if (!r) return getDefaultGlobalSkillNamesForRole(role);
    if (Object.prototype.hasOwnProperty.call(map, r)) {
      const raw = map[r];
      if (!Array.isArray(raw)) {
        return [];
      }
      return [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))];
    }
    return getDefaultGlobalSkillNamesForRole(role);
  }

  async getRoleDefaultGlobalSkillsConfig(): Promise<{
    roles: readonly string[];
    codeDefaults: Record<string, string[]>;
    /** 仅在 DB 中显式配置过的角色 → 覆盖后的键列表（可为空数组） */
    overrides: Record<string, string[]>;
    effective: Record<string, string[]>;
  }> {
    const row = await this.repo.findOne({ where: { key: ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY } });
    const stored = ((row?.value ?? {}) as Record<string, unknown>) ?? {};

    const roles = [...KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS];
    const codeDefaults: Record<string, string[]> = {};
    const overrides: Record<string, string[]> = {};
    const effective: Record<string, string[]> = {};

    for (const role of roles) {
      codeDefaults[role] = [...getDefaultGlobalSkillNamesForRole(role)];
      if (Object.prototype.hasOwnProperty.call(stored, role)) {
        const raw = stored[role];
        const names = Array.isArray(raw)
          ? [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))]
          : [];
        overrides[role] = names;
        effective[role] = names;
      } else {
        effective[role] = [...codeDefaults[role]!];
      }
    }

    return {
      roles,
      codeDefaults,
      overrides,
      effective,
    };
  }

  async patchRoleDefaultGlobalSkills(patch: Record<string, string[] | null>): Promise<{
    ok: true;
    roles: readonly string[];
    codeDefaults: Record<string, string[]>;
    overrides: Record<string, string[]>;
    effective: Record<string, string[]>;
  }> {
    const existingRow = await this.repo.findOne({ where: { key: ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY } });
    const next = { ...(existingRow?.value ?? {}) } as Record<string, unknown>;

    const allowedRoles = new Set(KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS as readonly string[]);

    for (const [role, names] of Object.entries(patch)) {
      const r = String(role ?? '').trim();
      if (!allowedRoles.has(r)) {
        continue;
      }
      if (names === null || names === undefined) {
        delete next[r];
      } else {
        next[r] = [...new Set(names.map((x) => String(x ?? '').trim()).filter(Boolean))];
      }
    }

    await this.repo.save(
      this.repo.create({
        key: ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY,
        value: next,
      }),
    );

    const refreshed = await this.getRoleDefaultGlobalSkillsConfig();
    return { ok: true, ...refreshed };
  }
}
