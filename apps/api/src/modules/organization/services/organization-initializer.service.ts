import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { resolveDefaultDepartments } from '@contracts/types';
import { AgentsBootstrapService } from '../../agents/services/agents-bootstrap.service.js';
import type { DepartmentPlacementDto } from '../../companies/dto/department-placement.dto.js';
import { OrganizationNode } from '../entities/organization-node.entity.js';

@Injectable()
export class OrganizationInitializerService {
  private readonly logger = new Logger(OrganizationInitializerService.name);

  constructor(
    @InjectRepository(OrganizationNode)
    private readonly nodesRepo: Repository<OrganizationNode>,
    private readonly agentsBootstrap: AgentsBootstrapService,
  ) {}

  /**
   * 与建部门节点、bootstrap 共用同一快照：trim 部门名、规范化 slug、成员 slug 去重。
   * 若全部为空白部门名则视为未提供，回退行业默认。
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
        };
      })
      .filter((p) => p.name.length > 0);
    return normalized.length > 0 ? (normalized as DepartmentPlacementDto[]) : undefined;
  }

  async initializeForCompany(
    companyId: string,
    industry?: string,
    industryCode?: string,
    placements?: DepartmentPlacementDto[],
  ): Promise<void> {
    const count = await this.nodesRepo.count({ where: { companyId } });
    if (count > 0) {
      return;
    }

    const effectivePlacements = this.normalizePlacements(placements);

    const board = this.nodesRepo.create({
      companyId,
      parentId: null,
      type: 'board',
      name: 'Board',
      description: '董事会',
      order: 0,
      metadata: { systemGenerated: true },
    });
    const savedBoard = await this.nodesRepo.save(board);

    const ceo = this.nodesRepo.create({
      companyId,
      parentId: savedBoard.id,
      type: 'ceo',
      name: 'CEO',
      description: '首席执行官',
      order: 0,
      metadata: { systemGenerated: true },
    });
    const savedCeo = await this.nodesRepo.save(ceo);

    const departments = effectivePlacements?.length
      ? effectivePlacements.map((p) => p.name)
      : resolveDefaultDepartments(industryCode, industry);
    const entities = departments.map((name, index) =>
      this.nodesRepo.create({
        companyId,
        parentId: savedCeo.id,
        type: 'department',
        name,
        description: `${name} department`,
        order: index,
        metadata: {
          systemGenerated: true,
          industry: industry || 'general',
          ...(effectivePlacements?.length ? { fromWizardPlacements: true } : {}),
        },
      }),
    );
    await this.nodesRepo.save(entities);

    await this.agentsBootstrap.ensureDefaultAgentsForCompany(
      companyId,
      effectivePlacements,
    );

    this.logger.log('Organization initialized for company', {
      companyId,
      industry,
      industryCode,
      departments: departments.length,
      usedWizardPlacements: Boolean(effectivePlacements?.length),
    });
  }

  /**
   * 向导草稿阶段：只做 CEO marketplace agent 的 key assignment 写入，
   * 让后续 setup-recommendation 能直接走 LLM（不依赖组织节点/Agent 已创建）。
   */
  async ensureCeoKeyAssignmentForCompany(companyId: string): Promise<void> {
    await this.agentsBootstrap.ensureCeoKeyAssignmentForCompany(companyId);
  }
}
