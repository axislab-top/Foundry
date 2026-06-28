import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import type { DepartmentPlacementDto } from '../dto/department-placement.dto.js';
import type { PlatformDepartmentWithDirector } from './platform-department-catalog.service.js';

export const MEMBERS_PER_DEPT_BY_SCALE: Record<'small' | 'medium' | 'large', number> = {
  small: 1,
  medium: 2,
  large: 3,
};

@Injectable()
export class MarketplaceMemberAssignmentService {
  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceRepo: Repository<MarketplaceAgent>,
  ) {}

  async loadPublishedEmployees(): Promise<MarketplaceAgent[]> {
    return this.marketplaceRepo.find({
      where: { isPublished: true, agentCategory: 'employee' } as any,
      order: { usageCount: 'DESC', name: 'ASC' } as any,
      take: 300,
    });
  }

  /** 按平台部门 slug 索引可分配的执行岗（department_roles 须能匹配部门） */
  buildEmployeePoolByDepartment(
    employees: MarketplaceAgent[],
    catalog: PlatformDepartmentWithDirector[],
  ): Map<string, string[]> {
    const pool = new Map<string, string[]>();
    for (const dept of catalog) {
      const matched = employees
        .filter((agent) => this.employeeMatchesDepartment(agent, dept))
        .map((agent) => agent.slug);
      if (matched.length) {
        pool.set(dept.slug, matched);
      }
    }
    return pool;
  }

  employeeMatchesDepartment(agent: MarketplaceAgent, dept: PlatformDepartmentWithDirector): boolean {
    const roles = Array.isArray(agent.departmentRoles) ? agent.departmentRoles : [];
    if (!roles.length) return false;

    const slug = dept.slug.trim().toLowerCase();
    const displayName = dept.displayName.trim();
    const displayStem = displayName.replace(/部$/u, '').toLowerCase();

    return roles.some((raw) => {
      const role = String(raw || '').trim();
      if (!role) return false;
      const lower = role.toLowerCase();
      const normalized = lower.replace(/\s+/g, '-');
      return (
        lower === slug ||
        normalized === slug ||
        role === displayName ||
        lower === displayStem ||
        displayName.includes(role) ||
        role.includes(displayName) ||
        slug.includes(normalized) ||
        normalized.includes(slug)
      );
    });
  }

  /**
   * 在已有编制上补齐执行岗：保留 LLM/模板已分配的成员，不足则按 usage 顺序从部门人才池填充。
   */
  fillMissingMembers(
    placements: DepartmentPlacementDto[],
    pool: Map<string, string[]>,
    scale: 'small' | 'medium' | 'large',
  ): DepartmentPlacementDto[] {
    const targetPerDept = MEMBERS_PER_DEPT_BY_SCALE[scale];
    const usedGlobally = new Set<string>();

    for (const p of placements) {
      if (p.headAgentSlug) usedGlobally.add(p.headAgentSlug);
      for (const s of p.memberAgentSlugs ?? []) {
        if (s) usedGlobally.add(s);
      }
    }

    return placements.map((placement) => {
      const slug = placement.platformDepartmentSlug?.trim();
      const existing = [...new Set((placement.memberAgentSlugs ?? []).map((s) => s.trim()).filter(Boolean))];
      const members: string[] = [];

      for (const memberSlug of existing) {
        if (!members.includes(memberSlug)) {
          members.push(memberSlug);
        }
      }

      if (!slug) {
        return { ...placement, memberAgentSlugs: members };
      }

      const candidates = pool.get(slug) ?? [];
      for (const candidate of candidates) {
        if (members.length >= targetPerDept) break;
        if (usedGlobally.has(candidate)) continue;
        usedGlobally.add(candidate);
        members.push(candidate);
      }

      return { ...placement, memberAgentSlugs: members };
    });
  }

  /** 将 LLM/模板结果合并到规模基线编制（基线保证部门完整，overlay 提供成员分配） */
  mergeOntoBaseline(
    baseline: DepartmentPlacementDto[],
    overlay: DepartmentPlacementDto[],
  ): DepartmentPlacementDto[] {
    const overlayMap = new Map(
      overlay
        .filter((p) => p.platformDepartmentSlug?.trim())
        .map((p) => [String(p.platformDepartmentSlug).trim(), p] as const),
    );

    return baseline.map((dept) => {
      const slug = dept.platformDepartmentSlug?.trim();
      if (!slug) return dept;
      const fromOverlay = overlayMap.get(slug);
      if (!fromOverlay) return dept;
      return {
        ...dept,
        headAgentSlug: dept.headAgentSlug ?? fromOverlay.headAgentSlug ?? null,
        memberAgentSlugs:
          (fromOverlay.memberAgentSlugs?.length ?? 0) > 0
            ? fromOverlay.memberAgentSlugs
            : dept.memberAgentSlugs,
      };
    });
  }
}
