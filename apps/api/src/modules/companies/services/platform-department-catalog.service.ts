import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformDepartment } from '../../templates/entities/platform-department.entity.js';
import type { DepartmentPlacementDto } from '../dto/department-placement.dto.js';

/** 后台已配置且已绑定已上架部门主管的平台部门 */
export type PlatformDepartmentWithDirector = {
  slug: string;
  displayName: string;
  headAgentSlug: string;
  headAgentName: string;
  sortOrder: number;
  isDefaultForNewCompany: boolean;
  category: string | null;
  responsibilitySummary: string | null;
  taskTypeTags: string[];
};

export const SCALE_DEPT_LIMIT: Record<'small' | 'medium' | 'large', number> = {
  small: 5,
  medium: 10,
  large: 99,
};

@Injectable()
export class PlatformDepartmentCatalogService {
  constructor(
    @InjectRepository(PlatformDepartment)
    private readonly platformDeptRepo: Repository<PlatformDepartment>,
  ) {}

  async loadDepartmentsWithDirectors(): Promise<PlatformDepartmentWithDirector[]> {
    const rows = await this.platformDeptRepo.find({
      relations: ['director'],
      order: { sortOrder: 'ASC', displayName: 'ASC' },
    });

    const out: PlatformDepartmentWithDirector[] = [];
    for (const row of rows) {
      const director = row.director;
      if (!director?.isPublished || director.agentCategory !== 'department_head') {
        continue;
      }
      const headAgentSlug = String(director.slug || '').trim();
      if (!headAgentSlug) continue;

      out.push({
        slug: row.slug,
        displayName: String(row.displayName || '').trim(),
        headAgentSlug,
        headAgentName: String(director.name || headAgentSlug).trim(),
        sortOrder: row.sortOrder ?? 0,
        isDefaultForNewCompany: row.isDefaultForNewCompany === true,
        category: row.category ?? null,
        responsibilitySummary: row.responsibilitySummary ?? null,
        taskTypeTags: Array.isArray(row.taskTypeTags) ? row.taskTypeTags : [],
      });
    }
    return out.filter((d) => d.displayName.length > 0 && d.slug.length > 0);
  }

  /** 按规模与默认标记选取部门子集（始终带主管 slug） */
  selectForScale(
    catalog: PlatformDepartmentWithDirector[],
    scale: 'small' | 'medium' | 'large',
  ): PlatformDepartmentWithDirector[] {
    if (!catalog.length) return [];

    const limit = Math.min(SCALE_DEPT_LIMIT[scale], catalog.length);
    const defaults = catalog.filter((d) => d.isDefaultForNewCompany);
    const others = catalog.filter((d) => !d.isDefaultForNewCompany);
    const ordered = [...defaults, ...others];
    const seen = new Set<string>();
    const picked: PlatformDepartmentWithDirector[] = [];

    for (const dept of ordered) {
      if (seen.has(dept.slug)) continue;
      seen.add(dept.slug);
      picked.push(dept);
      if (picked.length >= limit) break;
    }

    return picked;
  }

  /** 规模基线编制：固定部门集合 + 主管，成员由后续填充 */
  buildBaselinePlacements(
    catalog: PlatformDepartmentWithDirector[],
    scale: 'small' | 'medium' | 'large',
  ): DepartmentPlacementDto[] {
    return this.toPlacements(this.selectForScale(catalog, scale));
  }

  toPlacement(dept: PlatformDepartmentWithDirector): DepartmentPlacementDto {
    return {
      name: dept.displayName,
      headAgentSlug: dept.headAgentSlug,
      memberAgentSlugs: [],
      platformDepartmentSlug: dept.slug,
    };
  }

  toPlacements(catalog: PlatformDepartmentWithDirector[]): DepartmentPlacementDto[] {
    return catalog.map((d) => this.toPlacement(d));
  }

  findBySlugOrName(
    catalog: PlatformDepartmentWithDirector[],
    input: { slug?: string | null; name?: string | null },
  ): PlatformDepartmentWithDirector | null {
    const slug = String(input.slug ?? '').trim();
    if (slug) {
      const hit = catalog.find((d) => d.slug === slug);
      if (hit) return hit;
    }
    const name = String(input.name ?? '').trim();
    if (!name) return null;
    const exact = catalog.find((d) => d.displayName === name);
    if (exact) return exact;
    return (
      catalog.find((d) => name.includes(d.displayName) || d.displayName.includes(name)) ?? null
    );
  }

  filterPlacementsToCatalog(
    placements: DepartmentPlacementDto[],
    catalog: PlatformDepartmentWithDirector[],
  ): DepartmentPlacementDto[] {
    const slugSet = new Set(catalog.map((d) => d.slug));
    const out: DepartmentPlacementDto[] = [];
    const seen = new Set<string>();

    for (const raw of placements) {
      const matched = this.findBySlugOrName(catalog, {
        slug: raw.platformDepartmentSlug,
        name: raw.name,
      });
      if (!matched || seen.has(matched.slug)) continue;
      seen.add(matched.slug);

      const head = raw.headAgentSlug?.trim();
      const headValid = head === matched.headAgentSlug;
      out.push({
        name: matched.displayName,
        headAgentSlug: headValid ? head : matched.headAgentSlug,
        memberAgentSlugs: [...new Set((raw.memberAgentSlugs ?? []).map((s) => String(s).trim()).filter(Boolean))],
        platformDepartmentSlug: matched.slug,
      });
    }
    return out;
  }

  mergePlacementsBySlug(
    base: DepartmentPlacementDto[],
    overlay: DepartmentPlacementDto[],
  ): DepartmentPlacementDto[] {
    const overlayMap = new Map(
      overlay
        .filter((p) => p.platformDepartmentSlug?.trim())
        .map((p) => [String(p.platformDepartmentSlug).trim(), p] as const),
    );

    return base.map((dept) => {
      const slug = dept.platformDepartmentSlug?.trim();
      if (!slug) return dept;
      const fromOverlay = overlayMap.get(slug);
      if (!fromOverlay) return dept;
      return {
        ...dept,
        headAgentSlug: fromOverlay.headAgentSlug ?? dept.headAgentSlug,
        memberAgentSlugs:
          (fromOverlay.memberAgentSlugs?.length ?? 0) > 0
            ? fromOverlay.memberAgentSlugs
            : dept.memberAgentSlugs,
      };
    });
  }
}
