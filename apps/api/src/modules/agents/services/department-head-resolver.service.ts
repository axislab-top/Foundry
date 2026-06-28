import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../../templates/entities/platform-department.entity.js';
import { DEPARTMENT_ROLE_TOKEN_TO_ZH } from '@contracts/types';

function normalizeRoleToken(input: string): string {
  return String(input || '').trim().toLowerCase().replace(/\s+/g, '_');
}

@Injectable()
export class DepartmentHeadResolverService {
  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(PlatformDepartment)
    private readonly platformDeptRepo: Repository<PlatformDepartment>,
  ) {}

  /**
   * Resolve a published marketplace agent slug that can act as a department head (director).
   * Priority: 1) platform_departments 绑定总监 2) 显式 requestedSlug 3) department_roles 匹配
   */
  async resolveHeadSlug(params: {
    departmentName: string;
    requestedSlug?: string | null;
  }): Promise<string> {
    const departmentName = String(params.departmentName || '').trim();
    if (!departmentName) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'departmentName 不能为空',
      });
    }

    const fromPlatform = await this.resolveFromPlatformDepartment(departmentName);
    if (fromPlatform) {
      return fromPlatform;
    }

    const requestedSlug = params.requestedSlug?.trim() || null;
    if (requestedSlug) {
      const ma = await this.marketplaceAgentsRepo.findOne({
        where: { slug: requestedSlug, isPublished: true, agentCategory: 'department_head' } as any,
        select: ['slug'],
      });
      if (!ma) {
        throw new UnprocessableEntityException({
          code: ErrorCode.BUSINESS_LOGIC_ERROR,
          message: `部门「${departmentName}」指定的主管 Agent 未上架或未标记为部门主管: ${requestedSlug}`,
        });
      }
      return ma.slug;
    }

    const roleTokens = Array.from(
      (() => {
        const out = new Set<string>();
        const normalized = normalizeRoleToken(departmentName);
        const deptNameTrimmed = String(departmentName || '').trim();

        out.add(deptNameTrimmed);
        if (normalized) out.add(normalized);

        const mappedZh = DEPARTMENT_ROLE_TOKEN_TO_ZH[normalized];
        if (mappedZh) out.add(mappedZh);

        for (const [token, zh] of Object.entries(DEPARTMENT_ROLE_TOKEN_TO_ZH)) {
          if (zh === deptNameTrimmed) {
            out.add(token);
            break;
          }
        }

        return Array.from(out).filter(Boolean);
      })(),
    );

    const hit = await this.marketplaceAgentsRepo
      .createQueryBuilder('a')
      .select(['a.slug AS slug'])
      .where('a.is_published = true')
      .andWhere(`a.agent_category = 'department_head'`)
      .andWhere('a.department_roles && :roles', { roles: roleTokens })
      .orderBy('a.usage_count', 'DESC')
      .addOrderBy('a.updated_at', 'DESC')
      .limit(1)
      .getRawOne<{ slug: string }>();

    if (!hit?.slug) {
      throw new UnprocessableEntityException({
        code: ErrorCode.BUSINESS_LOGIC_ERROR,
        message: `部门「${departmentName}」无可用主管 Agent，请在商城上架并配置 agentCategory=department_head + departmentRoles`,
      });
    }
    return hit.slug;
  }

  /** 按部门中文名或 slug 命中平台部门行，返回已上架总监 slug */
  private async resolveFromPlatformDepartment(departmentName: string): Promise<string | null> {
    const trimmed = departmentName.trim();
    const normalized = normalizeRoleToken(trimmed);

    const qb = this.platformDeptRepo
      .createQueryBuilder('d')
      .innerJoin(MarketplaceAgent, 'a', 'a.id = d.director_marketplace_agent_id')
      .where('a.is_published = true')
      .andWhere(`a.agent_category = 'department_head'`);

    const row = await qb
      .andWhere('(d.slug = :slug OR d.display_name = :name)', {
        slug: normalized,
        name: trimmed,
      })
      .select('a.slug', 'slug')
      .getRawOne<{ slug: string }>();

    if (row?.slug) {
      return row.slug;
    }

    const zhHit = await this.platformDeptRepo
      .createQueryBuilder('d')
      .innerJoin(MarketplaceAgent, 'a', 'a.id = d.director_marketplace_agent_id')
      .where('a.is_published = true')
      .andWhere(`a.agent_category = 'department_head'`)
      .andWhere('d.display_name = :name', { name: trimmed })
      .select('a.slug', 'slug')
      .getRawOne<{ slug: string }>();

    return zhHit?.slug ?? null;
  }
}
