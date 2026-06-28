import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentsBootstrapService } from '../../agents/services/agents-bootstrap.service.js';
import type { DepartmentPlacementDto } from '../../companies/dto/department-placement.dto.js';
import { OrganizationNode } from '../entities/organization-node.entity.js';
import { OrganizationService } from './organization.service.js';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '@service/tenant';
import { PLATFORM_DEPARTMENTS } from '@foundry/contracts/types/departments';
import { buildDepartmentNodeCapabilityMetadata } from '../utils/department-capabilities-metadata.util.js';

@Injectable()
export class OrganizationInitializerService {
  private readonly logger = new Logger(OrganizationInitializerService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly agentsBootstrap: AgentsBootstrapService,
    private readonly organizationService: OrganizationService,
  ) {}

  private async fetchPlatformDefaultPlacements(): Promise<
    Array<{
      name: string;
      headAgentSlug: string | null;
      memberAgentSlugs: string[];
      platformDepartmentSlug: string;
      deferDepartmentAgents?: boolean;
    }>
  > {
    try {
      const rows = (await this.dataSource.query(
        `
          SELECT
            d.slug AS "platformDepartmentSlug",
            d.display_name AS "name",
            ma.slug AS "headAgentSlug"
          FROM platform_departments d
          LEFT JOIN marketplace_agents ma
            ON ma.id = d.director_marketplace_agent_id
          WHERE d.is_default_for_new_company = true
          ORDER BY d.sort_order ASC, d.display_name ASC
        `,
      )) as Array<{ platformDepartmentSlug: string; name: string; headAgentSlug: string }>;
      return rows
        .map((r) => ({
          name: String(r.name || '').trim(),
          headAgentSlug: String(r.headAgentSlug || '').trim() || null,
          memberAgentSlugs: [] as string[],
          platformDepartmentSlug: String(r.platformDepartmentSlug || '').trim(),
          // 若平台部门尚未绑定总监，则先只创建组织节点，避免 bootstrap 因缺主管而抛错。
          deferDepartmentAgents: !(String(r.headAgentSlug || '').trim().length > 0),
        }))
        .filter((p) => p.name.length > 0 && p.platformDepartmentSlug.length > 0);
    } catch (e: any) {
      this.logger.warn('Failed to load platform default departments from Admin configuration', {
        error: e?.message,
      });
      return [];
    }
  }

  /**
   * 与建部门节点、bootstrap 共用同一快照：trim 部门名、规范化 slug、成员 slug 去重。
   * 若全部为空白部门名则视为未提供，回退 Admin 配置的默认平台部门。
   */
  private normalizePlacements(
    placements?: DepartmentPlacementDto[],
  ): DepartmentPlacementDto[] | undefined {
    if (!placements?.length) {
      return undefined;
    }
    const normalized = placements
      .map((p) => {
        const head = p.headAgentSlug?.trim();
        const members = (p.memberAgentSlugs ?? []).map((s) => s.trim()).filter(Boolean);
        return {
          name: p.name.trim(),
          headAgentSlug: head && head.length > 0 ? head : null,
          memberAgentSlugs: [...new Set(members)],
          ...(p.platformDepartmentSlug?.trim()
            ? { platformDepartmentSlug: p.platformDepartmentSlug.trim() }
            : {}),
        };
      })
      .filter((p) => p.name.length > 0);
    return normalized.length > 0 ? (normalized as DepartmentPlacementDto[]) : undefined;
  }

  async hasExistingOrganizationStructure(companyId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const rows = await manager.query(
        `
          SELECT COUNT(*)::int AS cnt
          FROM organization_nodes
          WHERE company_id = $1 AND type IN ('ceo', 'department')
        `,
        [companyId],
      );
      return Number(rows?.[0]?.cnt ?? 0) > 0;
    });
  }

  private async hasBootstrapConverged(companyId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const rows = await manager.query(
        `
          SELECT
            (SELECT COUNT(*)::int FROM organization_nodes n
             WHERE n.company_id = $1 AND n.type = 'ceo' AND n.agent_id IS NOT NULL) AS ceo_bound_count,
            (SELECT COUNT(*)::int FROM agents a
             WHERE a.company_id = $1 AND a.status = 'active') AS active_agent_count
        `,
        [companyId],
      );
      const row = rows?.[0] as
        | { ceo_bound_count?: number | string; active_agent_count?: number | string }
        | undefined;
      const ceoBound = Number(row?.ceo_bound_count ?? 0);
      const activeAgents = Number(row?.active_agent_count ?? 0);
      return ceoBound > 0 && activeAgents > 0;
    });
  }

  private async ensureDefaultAgentsConverged(
    companyId: string,
    placements?: DepartmentPlacementDto[],
  ): Promise<void> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.agentsBootstrap.ensureDefaultAgentsForCompany(companyId, placements);
      const ok = await this.hasBootstrapConverged(companyId);
      if (ok) {
        if (attempt > 1) {
          this.logger.warn('Default agents bootstrap converged on retry', {
            companyId,
            attempt,
          });
        }
        return;
      }
      this.logger.warn('Default agents bootstrap not converged yet', {
        companyId,
        attempt,
      });
    }
    throw new Error('Default agents bootstrap did not converge: CEO/agents missing after retries');
  }

  async initializeForCompany(
    companyId: string,
    industry?: string,
    industryCode?: string,
    placements?: DepartmentPlacementDto[],
  ): Promise<void> {
    const normalizedWizard = this.normalizePlacements(placements);
    const useWizardPlacements = Boolean(normalizedWizard?.length);
    const platformDefaults = !normalizedWizard ? await this.fetchPlatformDefaultPlacements() : [];
    const effectivePlacements = normalizedWizard ?? platformDefaults;

    if (!effectivePlacements.length && !normalizedWizard) {
      this.logger.log('No default platform departments in Admin; initializing board and CEO only', {
        companyId,
      });
    }

    let createdNewNodes = false;
    let createdDepartmentCount = 0;

    await this.dataSource.transaction(async (manager) => {
      // Ensure RLS & FK checks see the correct tenant rows inside this statement group.
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

      const nodesRepo = manager.getRepository(OrganizationNode);

      // 1) 查已有组织节点，避免重复，但确保最小结构（board + ceo；部门可选）。
      const existingBoards = await nodesRepo.find({
        where: { companyId, type: 'board', parentId: null } as any,
        order: { order: 'ASC' } as any,
      });
      let board = existingBoards[0] ?? null;

      const existingCeoNodes = await nodesRepo.find({
        where: { companyId, type: 'ceo' } as any,
        order: { order: 'ASC' } as any,
      });
      let ceoNode = existingCeoNodes[0] ?? null;

      const existingDepartments = await nodesRepo.find({
        where: { companyId, type: 'department' } as any,
        order: { order: 'ASC' } as any,
      });

      // 若完全没有任何节点，按照原有逻辑一次性创建完整树。
      if (!board && !ceoNode && existingDepartments.length === 0) {
        createdNewNodes = true;

        board = nodesRepo.create({
          companyId,
          parentId: null,
          type: 'board',
          name: 'Board',
          description: '董事会',
          order: 0,
          metadata: { systemGenerated: true },
        });
        const savedBoard = await nodesRepo.save(board);

        ceoNode = nodesRepo.create({
          companyId,
          parentId: savedBoard.id,
          type: 'ceo',
          name: 'CEO',
          description: '首席执行官',
          order: 0,
          metadata: { systemGenerated: true },
        });
        const savedCeo = await nodesRepo.save(ceoNode);

        createdDepartmentCount = effectivePlacements.length;

        const entities = effectivePlacements.map((p, index) => {
          const platSlug = (p as { platformDepartmentSlug?: string }).platformDepartmentSlug?.trim() || '';
          const tmpl = platSlug ? PLATFORM_DEPARTMENTS.find((d) => d.slug === platSlug) : undefined;
          const capabilityMeta = tmpl
            ? buildDepartmentNodeCapabilityMetadata({
                input: { responsibilitySummary: tmpl.responsibilitySummary },
                platformRow: {
                  slug: tmpl.slug,
                  responsibilitySummary: tmpl.responsibilitySummary,
                  taskTypeTags: [...tmpl.taskTypeTags],
                  excludesTaskTypeTags: tmpl.excludesTaskTypeTags ? [...tmpl.excludesTaskTypeTags] : [],
                },
                capabilitiesSource: 'platform_template',
                platformDepartmentSlug: platSlug,
              })
            : {};
          const description =
            String(capabilityMeta.responsibilitySummary ?? '').trim() ||
            (p as { description?: string }).description ||
            `${p.name} department`;
          return nodesRepo.create({
            companyId,
            parentId: savedCeo.id,
            type: 'department',
            name: p.name,
            description,
            order: index,
            metadata: {
              systemGenerated: true,
              industry: industry || 'general',
              ...(useWizardPlacements ? { fromWizardPlacements: true } : {}),
              ...((p as { deferDepartmentAgents?: boolean }).deferDepartmentAgents
                ? { deferDepartmentAgents: true }
                : {}),
              ...(platSlug ? { platformDepartmentSlug: platSlug } : {}),
              ...capabilityMeta,
            },
          });
        });
        await nodesRepo.save(entities);
        return;
      }

      // 2) 已有部分节点（历史或外部写入）：补齐缺失的 board / ceo / department。
      //    - 若无 board，则以任意 ceo/department 的祖先为参考，补一个顶层 Board。
      if (!board) {
        board = nodesRepo.create({
          companyId,
          parentId: null,
          type: 'board',
          name: 'Board',
          description: '董事会',
          order: 0,
          metadata: { systemGenerated: true },
        });
        board = await nodesRepo.save(board);
      }

      if (!ceoNode) {
        ceoNode = nodesRepo.create({
          companyId,
          parentId: board.id,
          type: 'ceo',
          name: 'CEO',
          description: '首席执行官',
          order: 0,
          metadata: { systemGenerated: true },
        });
        ceoNode = await nodesRepo.save(ceoNode);
        createdNewNodes = true;
      }

      if (existingDepartments.length === 0) {
        createdDepartmentCount = effectivePlacements.length;

        const entities = effectivePlacements.map((p, index) =>
          nodesRepo.create({
            companyId,
            parentId: ceoNode!.id,
            type: 'department',
            name: p.name,
            description: (p as { description?: string }).description ?? `${p.name} department`,
            order: index,
            metadata: {
              systemGenerated: true,
              industry: industry || 'general',
              ...(useWizardPlacements ? { fromWizardPlacements: true } : {}),
              ...((p as { deferDepartmentAgents?: boolean }).deferDepartmentAgents
                ? { deferDepartmentAgents: true }
                : {}),
              ...((p as { platformDepartmentSlug?: string }).platformDepartmentSlug
                ? { platformDepartmentSlug: (p as { platformDepartmentSlug: string }).platformDepartmentSlug }
                : {}),
            },
          }),
        );
        await nodesRepo.save(entities);
        createdNewNodes = true;
      }
    });

    // Regardless of whether org nodes are already present, we should still ensure default agents.
    // Enforce post-condition to avoid silent partial success (company active but no agents bound).
    const placementDtos =
      effectivePlacements.length > 0
        ? effectivePlacements.map((p) => ({
            name: p.name,
            headAgentSlug: p.headAgentSlug ?? null,
            memberAgentSlugs: p.memberAgentSlugs ?? [],
            ...('platformDepartmentSlug' in p &&
            (p as { platformDepartmentSlug?: string }).platformDepartmentSlug
              ? { platformDepartmentSlug: (p as { platformDepartmentSlug: string }).platformDepartmentSlug }
              : {}),
          }))
        : undefined;
    await this.ensureDefaultAgentsConverged(companyId, placementDtos);
    await this.organizationService.invalidateTreeCache(companyId);

    if (createdNewNodes) {
      this.logger.log('Organization initialized for company', {
        companyId,
        industry,
        industryCode,
        departments: createdDepartmentCount,
        usedWizardPlacements: useWizardPlacements,
      });
    }
  }

  /**
   * 向导草稿阶段：只做 CEO marketplace agent 的 key assignment 写入，
   * 让后续 setup-recommendation 能直接走 LLM（不依赖组织节点/Agent 已创建）。
   */
  async ensureCeoKeyAssignmentForCompany(companyId: string): Promise<void> {
    await this.agentsBootstrap.ensureCeoKeyAssignmentForCompany(companyId);
  }
}
