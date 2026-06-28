import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import { TenantContextService } from '@service/tenant';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { StorageService } from '../../files/storage/storage.service.js';
import { CreateSkillDto } from '../dto/create-skill.dto.js';
import { QuerySkillsDto } from '../dto/query-skills.dto.js';
import { UpdateSkillDto } from '../dto/update-skill.dto.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillRevision } from '../entities/skill-revision.entity.js';
import { SkillArtifact } from '../entities/skill-artifact.entity.js';
import { AgentSkill } from '../../agents/entities/agent-skill.entity.js';
import { SkillMcpToolBinding } from '../entities/skill-mcp-tool-binding.entity.js';
import { SkillToolBinding } from '../entities/skill-tool-binding.entity.js';
import { McpTool } from '../../mcp-tools/entities/mcp-tool.entity.js';
import { Tool } from '../../tools/entities/tool.entity.js';
import { SkillValidatorService } from './skill-validator.service.js';
import { SkillBindingValidatorService } from './skill-binding-validator.service.js';
import { SkillsBindingMetricsService } from './skills-binding-metrics.service.js';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';

interface Actor {
  id: string;
  roles?: string[];
}

type SkillGovernanceInput = {
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  maxInputSizeBytes?: number | null;
  timeoutSeconds?: number | null;
  chunkStrategy?: string | null;
  category?: string[] | null;
  icon?: string | null;
};

export function skillToSnapshot(skill: Skill): SkillToolSnapshot {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    toolSchema: skill.toolSchema,
    promptTemplate: skill.promptTemplate,
    implementationType: skill.implementationType,
    handlerConfig: skill.handlerConfig,
    requiredPermissions: skill.requiredPermissions ?? [],
    version: skill.version,
    semverVersion: skill.semverVersion?.trim() ? skill.semverVersion.trim() : '1.0.0',
    isPublic: skill.isPublic,
    isSystem: skill.isSystem,

    // P0 governance snapshot
    maxInputTokens: (skill as any).maxInputTokens ?? null,
    maxOutputTokens: (skill as any).maxOutputTokens ?? null,
    maxInputSizeBytes: (skill as any).maxInputSizeBytes ?? null,
    timeoutSeconds: (skill as any).timeoutSeconds ?? null,
    chunkStrategy: (skill as any).chunkStrategy ?? null,
    category: (skill as any).category ?? null,
    icon: (skill as any).icon ?? null,
  };
}

export function revisionToSnapshot(rev: SkillRevision): SkillToolSnapshot {
  const governance =
    rev?.metadata && typeof rev.metadata === 'object' && !Array.isArray(rev.metadata)
      ? (((rev.metadata as any).governance ?? null) as Record<string, unknown> | null)
      : null;
  return {
    id: rev.skillId,
    name: rev.name,
    description: rev.description,
    toolSchema: rev.toolSchema,
    promptTemplate: rev.promptTemplate,
    implementationType: rev.implementationType,
    handlerConfig: rev.handlerConfig,
    requiredPermissions: rev.requiredPermissions ?? [],
    version: rev.version,
    isPublic: rev.isPublic,
    isSystem: rev.isSystem,

    // P0 governance snapshot (stored on revision.metadata.governance)
    maxInputTokens: governance && typeof (governance as any).maxInputTokens === 'number' ? ((governance as any).maxInputTokens as number) : null,
    maxOutputTokens: governance && typeof (governance as any).maxOutputTokens === 'number' ? ((governance as any).maxOutputTokens as number) : null,
    maxInputSizeBytes: governance && typeof (governance as any).maxInputSizeBytes === 'number' ? ((governance as any).maxInputSizeBytes as number) : null,
    timeoutSeconds: governance && typeof (governance as any).timeoutSeconds === 'number' ? ((governance as any).timeoutSeconds as number) : null,
    chunkStrategy: governance && typeof (governance as any).chunkStrategy === 'string' ? ((governance as any).chunkStrategy as string) : null,
    category: governance && Array.isArray((governance as any).category) ? (((governance as any).category as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean) as string[]) : null,
    icon: governance && typeof (governance as any).icon === 'string' ? String((governance as any).icon) : null,
  };
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillRevision)
    private readonly revisionsRepo: Repository<SkillRevision>,
    @InjectRepository(SkillArtifact)
    private readonly artifactsRepo: Repository<SkillArtifact>,
    @InjectRepository(AgentSkill)
    private readonly agentSkillsRepo: Repository<AgentSkill>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(SkillMcpToolBinding)
    private readonly mcpBindingsRepo: Repository<SkillMcpToolBinding>,
    @InjectRepository(McpTool)
    private readonly mcpToolsRepo: Repository<McpTool>,
    @InjectRepository(SkillToolBinding)
    private readonly toolBindingsRepo: Repository<SkillToolBinding>,
    @InjectRepository(Tool)
    private readonly toolsRepo: Repository<Tool>,
    private readonly tenantContext: TenantContextService,
    private readonly skillValidator: SkillValidatorService,
    private readonly storage: StorageService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly skillsBindingMetrics?: SkillsBindingMetricsService,
  ) {}

  /**
   * Build runtime snapshots and inject bound MCP tools from authoritative bindings.
   *
   * Used by worker entrypoints like `agents.effectiveSkillSnapshots` to populate ToolRegistry
   * without relying on legacy `handlerConfig.mcpTools`.
   */
  async skillsToSnapshotsWithBindings(rows: Skill[]): Promise<SkillToolSnapshot[]> {
    const skills = Array.isArray(rows) ? rows : [];
    if (skills.length === 0) return [];
    const skillIds = skills.map((s) => s.id);
    const [mcpBindings, toolBindings] = await Promise.all([
      this.mcpBindingsRepo.find({
        where: { skillId: In(skillIds) } as any,
        order: { skillId: 'ASC' as any, position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
      this.toolBindingsRepo.find({
        where: { skillId: In(skillIds) } as any,
        order: { skillId: 'ASC' as any, position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
    ]);

    const mcpToolIds = [...new Set(mcpBindings.map((b) => b.mcpToolId))];
    const mcpTools = mcpToolIds.length ? await this.mcpToolsRepo.find({ where: { id: In(mcpToolIds) } as any }) : [];
    const mcpByToolId = new Map(mcpTools.map((t) => [t.id, t]));
    const mcpBySkillId = new Map<string, SkillMcpToolBinding[]>();
    mcpBindings.forEach((b) => {
      const list = mcpBySkillId.get(b.skillId) ?? [];
      list.push(b);
      mcpBySkillId.set(b.skillId, list);
    });

    const toolIds = [...new Set(toolBindings.map((b) => b.toolId))];
    const tools = toolIds.length ? await this.toolsRepo.find({ where: { id: In(toolIds) } as any }) : [];
    const toolById = new Map(tools.map((t) => [t.id, t]));
    const toolBySkillId = new Map<string, SkillToolBinding[]>();
    toolBindings.forEach((b) => {
      const list = toolBySkillId.get(b.skillId) ?? [];
      list.push(b);
      toolBySkillId.set(b.skillId, list);
    });

    return skills.map((skill) => {
      const base = skillToSnapshot(skill);
      const boundTools = (toolBySkillId.get(skill.id) ?? [])
        .map((b) => toolById.get(b.toolId))
        .filter((t): t is Tool => !!t && !!t.isEnabled)
        .map((t) => ({
          name: `tool.${t.name}`,
          description: t.description ?? t.name,
          inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
          securityProfile: (t.securityProfile ?? null) as any,
          requiredPermissions: (t.requiredPermissions ?? []) as any,
          handlerConfig: (t.handlerConfig ?? null) as any,
          metadata: { toolId: t.id },
        }));

      const boundMcpTools: McpToolDefinition[] = (mcpBySkillId.get(skill.id) ?? [])
        .map((b) => mcpByToolId.get(b.mcpToolId))
        .filter((t): t is McpTool => !!t && !!t.isEnabled)
        .map((t) => ({
          name: `mcp.${t.name}`,
          description: t.description ?? t.name,
          inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
          metadata: {
            toolId: t.id,
            serverRef: t.serverRef ?? null,
            transport: t.transport ?? null,
            scope: t.scope ?? null,
            endpointUrl: t.endpointUrl ?? null,
          },
        }));
      return { ...base, boundTools, boundMcpTools };
    });
  }

  /**
   * Agent 事件 / MCP 注册与 `agents.effectiveSkillSnapshots` 同源：
   * 启用态 Skill 行 + Plan A `skill_*_bindings`。
   */
  async buildAgentSkillSnapshotsForTenant(
    companyId: string,
    skillIds: string[],
  ): Promise<SkillToolSnapshot[]> {
    const ids = [...new Set((skillIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const rows = await this.findByIdsForTenant(ids, companyId);
    return this.skillsToSnapshotsWithBindings(rows.filter((r) => r.isEnabled));
  }

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private async assertCanManage(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
  }

  private validateGovernanceFields(input: SkillGovernanceInput): void {
    const checkIntRange = (name: string, value: number | null | undefined, min: number, max: number) => {
      if (value === undefined || value === null) return;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `${name} 必须是 ${min}~${max} 的整数`,
        });
      }
    };
    // P0 governance defaults:
    // - Token budgets align with typical long-context limits and prevent foot-guns.
    // - Size/timeout are guarded to avoid unbounded payloads / long running skills.
    checkIntRange('maxInputTokens', input.maxInputTokens, 100, 128_000);
    checkIntRange('maxOutputTokens', input.maxOutputTokens, 1, 128_000);
    checkIntRange('maxInputSizeBytes', input.maxInputSizeBytes, 1_024, 50 * 1024 * 1024);
    checkIntRange('timeoutSeconds', input.timeoutSeconds, 1, 3_600);
    if (input.chunkStrategy !== undefined && input.chunkStrategy !== null) {
      const strategy = String(input.chunkStrategy).trim();
      if (!['none', 'fixed', 'semantic'].includes(strategy)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'chunkStrategy 仅支持 none|fixed|semantic',
        });
      }
    }
    if (input.category !== undefined && input.category !== null) {
      if (!Array.isArray(input.category) || input.category.some((x) => !String(x ?? '').trim())) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'category 必须为非空字符串数组',
        });
      }
      if (input.category.length > 16) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'category 最多 16 项',
        });
      }
    }
    if (input.icon !== undefined && input.icon !== null && String(input.icon).length > 2048) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'icon 长度不能超过 2048',
      });
    }
  }

  async create(dto: CreateSkillDto, actor: Actor): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    this.skillValidator.validateToolSchema(dto.toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(dto.implementationType ?? 'builtin', dto.handlerConfig ?? undefined);
    this.validateGovernanceFields(dto);
    const targetCompanyId = dto.companyId ?? companyId;
    if (targetCompanyId !== companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '只能为当前公司创建私有 Skill',
      });
    }
    const saved = await this.skillsRepo.save(
      this.skillsRepo.create({
        companyId: targetCompanyId,
        name: dto.name,
        description: dto.description ?? null,
        toolSchema: dto.toolSchema ?? null,
        promptTemplate: dto.promptTemplate ?? null,
        implementationType: dto.implementationType ?? 'builtin',
        handlerConfig: dto.handlerConfig ?? null,
        requiredPermissions: dto.requiredPermissions ?? [],
        version: dto.version ?? 1,
        isPublic: dto.isPublic ?? true,
        isSystem: dto.isSystem ?? false,
        metadata: dto.metadata ?? null,
        maxInputTokens: dto.maxInputTokens ?? null,
        maxOutputTokens: dto.maxOutputTokens ?? null,
        maxInputSizeBytes: dto.maxInputSizeBytes ?? null,
        timeoutSeconds: dto.timeoutSeconds ?? 300,
        chunkStrategy: dto.chunkStrategy ?? 'none',
        category: dto.category ?? null,
        icon: dto.icon ?? null,
      }),
    );

    // P0-Phase3: Auto create Revision v1 and publish it (no artifact).
    const scan = this.skillValidator.scanSkillRisk({
      toolSchema: saved.toolSchema ?? undefined,
      promptTemplate: saved.promptTemplate ?? undefined,
      name: saved.name,
    });
    const revMeta: Record<string, unknown> = {
      ...(saved.metadata ?? {}),
      governance: {
        maxInputTokens: saved.maxInputTokens,
        maxOutputTokens: saved.maxOutputTokens,
        maxInputSizeBytes: saved.maxInputSizeBytes,
        timeoutSeconds: saved.timeoutSeconds,
        chunkStrategy: saved.chunkStrategy,
        category: saved.category,
        icon: saved.icon,
      },
    };
    const rev = await this.revisionsRepo.save(
      this.revisionsRepo.create({
        skillId: saved.id,
        companyId: saved.companyId,
        version: 1,
        status: 'published',
        reviewStatus: 'approved',
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        riskLevel: scan.riskLevel,
        scanResult: { findings: scan.findings },
        reviewComment: null,
        name: saved.name,
        description: saved.description ?? null,
        toolSchema: saved.toolSchema ?? null,
        promptTemplate: saved.promptTemplate ?? null,
        implementationType: saved.implementationType as any,
        handlerConfig: saved.handlerConfig ?? null,
        requiredPermissions: saved.requiredPermissions ?? [],
        isPublic: saved.isPublic,
        isSystem: saved.isSystem,
        metadata: revMeta,
        artifactId: null,
        createdByUserId: actor.id,
      }),
    );
    await this.skillsRepo.update(
      { id: saved.id } as any,
      { currentRevisionId: rev.id, publishedRevisionId: rev.id } as any,
    );
    (saved as any).currentRevisionId = rev.id;
    (saved as any).publishedRevisionId = rev.id;

    // P0-Phase3: MCP skill auto runtime registration.
    if ((saved.implementationType as any) === 'mcp') {
      const tools = Array.isArray((saved.handlerConfig as any)?.mcpTools)
        ? (((saved.handlerConfig as any).mcpTools as unknown[])
            .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
            .slice(0, 50) as McpToolDefinition[])
        : [];
      await this.toolRegistry.registerMcpTools(saved.id, tools, {
        companyId: targetCompanyId,
        layer: null,
        securityProfile: 'safe',
        source: 'skills_service.create.mcp_autoregister',
      });
    }
    await this.skillBindingValidator.invalidateCompanyBoundSkillsCache(targetCompanyId);
    return saved;
  }

  /**
   * P0-Phase3: bulk create platform-global skills (company_id IS NULL).
   * Admin-only: this is a platform operation.
   * Notes:
   * - Creates Skill rows and auto-publishes Revision v1 per skill.
   * - Does NOT attach to tenant binding catalogs (P13) by default.
   */
  async bulkCreateGlobalSkills(dtoList: CreateSkillDto[], actor: Actor): Promise<Skill[]> {
    if (!actor?.roles?.includes('admin')) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅平台管理员可批量创建 Global Skills',
      });
    }
    const list = Array.isArray(dtoList) ? dtoList : [];
    if (list.length === 0) return [];

    const out: Skill[] = [];
    for (const dto of list) {
      this.skillValidator.validateToolSchema(dto?.toolSchema ?? undefined);
      this.skillValidator.validateHandlerConfig(dto?.implementationType ?? 'builtin', dto?.handlerConfig ?? undefined);
      this.validateGovernanceFields(dto ?? {});

      const saved = await this.skillsRepo.save(
        this.skillsRepo.create({
          companyId: null,
          name: String(dto?.name ?? '').trim(),
          description: dto?.description ?? null,
          toolSchema: dto?.toolSchema ?? null,
          promptTemplate: dto?.promptTemplate ?? null,
          implementationType: (dto?.implementationType ?? 'builtin') as any,
          handlerConfig: dto?.handlerConfig ?? null,
          requiredPermissions: dto?.requiredPermissions ?? [],
          version: dto?.version ?? 1,
          isPublic: dto?.isPublic ?? true,
          isSystem: dto?.isSystem ?? false,
          metadata: dto?.metadata ?? null,
          maxInputTokens: dto?.maxInputTokens ?? null,
          maxOutputTokens: dto?.maxOutputTokens ?? null,
          maxInputSizeBytes: dto?.maxInputSizeBytes ?? null,
          timeoutSeconds: dto?.timeoutSeconds ?? 300,
          chunkStrategy: dto?.chunkStrategy ?? 'none',
          category: dto?.category ?? null,
          icon: dto?.icon ?? null,
        }),
      );

      const scan = this.skillValidator.scanSkillRisk({
        toolSchema: saved.toolSchema ?? undefined,
        promptTemplate: saved.promptTemplate ?? undefined,
        name: saved.name,
      });
      const revMeta: Record<string, unknown> = {
        ...(saved.metadata ?? {}),
        governance: {
          maxInputTokens: saved.maxInputTokens,
          maxOutputTokens: saved.maxOutputTokens,
          maxInputSizeBytes: saved.maxInputSizeBytes,
          timeoutSeconds: saved.timeoutSeconds,
          chunkStrategy: saved.chunkStrategy,
          category: saved.category,
          icon: saved.icon,
        },
      };
      const rev = await this.revisionsRepo.save(
        this.revisionsRepo.create({
          skillId: saved.id,
          companyId: null,
          version: 1,
          status: 'published',
          reviewStatus: 'approved',
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
          riskLevel: scan.riskLevel,
          scanResult: { findings: scan.findings },
          reviewComment: null,
          name: saved.name,
          description: saved.description ?? null,
          toolSchema: saved.toolSchema ?? null,
          promptTemplate: saved.promptTemplate ?? null,
          implementationType: saved.implementationType as any,
          handlerConfig: saved.handlerConfig ?? null,
          requiredPermissions: saved.requiredPermissions ?? [],
          isPublic: saved.isPublic,
          isSystem: saved.isSystem,
          metadata: revMeta,
          artifactId: null,
          createdByUserId: actor.id,
        }),
      );
      await this.skillsRepo.update(
        { id: saved.id } as any,
        { currentRevisionId: rev.id, publishedRevisionId: rev.id } as any,
      );
      (saved as any).currentRevisionId = rev.id;
      (saved as any).publishedRevisionId = rev.id;

      if ((saved.implementationType as any) === 'mcp') {
        const tools = Array.isArray((saved.handlerConfig as any)?.mcpTools)
          ? (((saved.handlerConfig as any).mcpTools as unknown[])
              .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
              .slice(0, 50) as McpToolDefinition[])
          : [];
        // Bind under synthetic "agentId=skillId" key for runtime lookup within current tenant context.
        const currentCompanyId = this.getCompanyIdOrThrow();
        await this.toolRegistry.registerMcpTools(saved.id, tools, {
          companyId: currentCompanyId,
          layer: null,
          securityProfile: 'safe',
          source: 'skills_service.bulkCreateGlobalSkills.mcp_autoregister',
        });
      }
      out.push(saved);
    }
    return out;
  }

  async findGlobalSkills(query?: { category?: string; implementationType?: string }): Promise<Skill[]> {
    const qb = this.skillsRepo.createQueryBuilder('s').where('s.company_id IS NULL');
    const impl = String(query?.implementationType ?? '').trim();
    if (impl) {
      qb.andWhere('s.implementation_type = :impl', { impl });
    }
    const cat = String(query?.category ?? '').trim();
    if (cat) {
      // category is JSONB array; match any skill whose category contains the requested tag.
      qb.andWhere('s.category @> :cat::jsonb', { cat: JSON.stringify([cat]) });
    }
    qb.orderBy('s.name', 'ASC');
    return qb.getMany();
  }

  async findGlobalMcpTools(): Promise<Skill[]> {
    return this.findGlobalSkills({ implementationType: 'mcp' });
  }

  async findAll(query: QuerySkillsDto): Promise<{
    items: Skill[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 50;
    const qb = this.skillsRepo.createQueryBuilder('s');
    if (query.companyOnly) {
      qb.where('s.company_id = :companyId', { companyId });
    } else {
      qb.where('(s.company_id IS NULL OR s.company_id = :companyId)', { companyId });
    }
    if (query.search) {
      qb.andWhere('s.name ILIKE :search', { search: `%${query.search}%` });
    }
    qb.orderBy('s.name', 'ASC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    const skill = await this.skillsRepo
      .createQueryBuilder('s')
      .where('s.id = :id AND (s.company_id IS NULL OR s.company_id = :companyId)', {
        id,
        companyId,
      })
      .getOne();
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在',
      });
    }
    const revisions = await this.revisionsRepo.find({
      where: [
        { skillId: skill.id, companyId },
        { skillId: skill.id, companyId: IsNull() },
      ] as any,
      order: { version: 'DESC' as any, createdAt: 'DESC' as any },
      take: 100,
    });
    const bindings = await this.agentSkillsRepo.find({
      where: { companyId, skillId: skill.id } as any,
      select: ['agentId', 'skillId', 'version', 'semverVersion', 'source', 'isTemporary', 'expiresAt', 'createdAt'],
      order: { createdAt: 'DESC' as any },
      take: 200,
    });
    return Object.assign(skill, {
      revisions,
      bindingVersions: bindings.map((b) => ({
        agentId: b.agentId,
        skillId: b.skillId,
        version: b.version ?? null,
        semverVersion: b.semverVersion ?? null,
        source: b.source ?? null,
        isTemporary: Boolean(b.isTemporary),
        expiresAt: b.expiresAt ?? null,
        createdAt: b.createdAt,
      })),
    });
  }

  async assertSkillUsableByTenant(skillId: string, companyId: string): Promise<Skill> {
    await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, [skillId], {
      operatorId: null,
      source: 'skills.assertSkillUsableByTenant',
    });
    const skill = await this.skillsRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在',
      });
    }
    return skill;
  }

  /** 仅保留仍存在于 `skills` 且 `company_id IS NULL` 的 ID（顺序与入参去重后一致）。 */
  async filterExistingGlobalSkillIds(ids: string[]): Promise<string[]> {
    const uniq = [...new Set(ids.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!uniq.length) return [];
    const rows = await this.skillsRepo.find({
      where: { id: In(uniq), companyId: IsNull() },
      select: ['id'],
    });
    const ok = new Set(rows.map((r) => r.id));
    return uniq.filter((id) => ok.has(id));
  }

  /**
   * Resolve platform-global skill IDs by stable names (seed data).
   * P20：默认仅解析 `is_latest` 行；`semver` 显式时解析该 semver 行（向下兼容无列数据视为 1.0.0）。
   */
  async findGlobalSkillIdsByNames(names: string[], opts?: { semver?: string }): Promise<string[]> {
    if (names.length === 0) return [];
    const semver = opts?.semver?.trim();
    const qb = this.skillsRepo
      .createQueryBuilder('s')
      .where('s.company_id IS NULL AND s.name IN (:...names)', { names });
    if (semver) {
      qb.andWhere('s.semver_version = :semver', { semver });
    } else {
      qb.andWhere('s.is_latest = :il', { il: true });
    }
    const skills = await qb.getMany();
    const byName = new Map(skills.map((s) => [s.name, s.id]));
    return names.map((n) => byName.get(n)).filter((id): id is string => !!id);
  }

  async resolveOptionalGlobalSkillIdsByNames(
    names: string[],
    opts?: { source?: string; semver?: string },
  ): Promise<{ skillIds: string[]; missingNames: string[] }> {
    const dedupedNames = Array.from(
      new Set(
        names
          .map((n) => String(n ?? '').trim())
          .filter(Boolean),
      ),
    );
    if (dedupedNames.length === 0) {
      return { skillIds: [], missingNames: [] };
    }
    const semver = opts?.semver?.trim();
    const qb = this.skillsRepo
      .createQueryBuilder('s')
      .where('s.company_id IS NULL AND s.name IN (:...names)', { names: dedupedNames });
    if (semver) {
      qb.andWhere('s.semver_version = :semver', { semver });
    } else {
      qb.andWhere('s.is_latest = :il', { il: true });
    }
    const skills = await qb.getMany();
    const byName = new Map(skills.map((s) => [s.name, s.id]));
    const missingNames = dedupedNames.filter((n) => !byName.has(n));
    if (missingNames.length > 0) {
      this.skillsBindingMetrics?.incBindMissing(opts?.source ?? 'unknown', missingNames.length);
    }
    const skillIds = dedupedNames
      .map((n) => byName.get(n))
      .filter((id): id is string => !!id);
    return { skillIds, missingNames };
  }

  async resolveRequiredGlobalSkillIdsByNames(
    names: string[],
    opts?: { source?: string; errorPrefix?: string; semver?: string },
  ): Promise<string[]> {
    const { skillIds, missingNames } = await this.resolveOptionalGlobalSkillIdsByNames(names, {
      source: opts?.source,
      semver: opts?.semver,
    });
    if (missingNames.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message:
          `${opts?.errorPrefix ?? '缺少 Global Skills'}: ${missingNames.join(', ')}` +
          '。请先由平台管理员在 Global Skills 中创建/Seed 后重试。',
        missingSkills: missingNames,
      });
    }
    return skillIds;
  }

  async findByIdsForTenant(skillIds: string[], companyId: string): Promise<Skill[]> {
    if (skillIds.length === 0) return [];
    return this.skillsRepo
      .createQueryBuilder('s')
      .where('s.id IN (:...skillIds)', { skillIds })
      .andWhere('(s.company_id IS NULL OR s.company_id = :companyId)', { companyId })
      .getMany();
  }

  async findPublishedRevisionsBySkillIdsForTenant(skillIds: string[], companyId: string): Promise<SkillRevision[]> {
    if (skillIds.length === 0) return [];
    return this.revisionsRepo
      .createQueryBuilder('r')
      .where('r.skill_id IN (:...skillIds)', { skillIds })
      .andWhere('r.status = :st', { st: 'published' })
      .andWhere('r.review_status = :rv', { rv: 'approved' })
      .andWhere('(r.company_id IS NULL OR r.company_id = :companyId)', { companyId })
      .getMany();
  }

  async update(id: string, dto: UpdateSkillDto, actor: Actor): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    if (dto.toolSchema !== undefined) {
      this.skillValidator.validateToolSchema(dto.toolSchema);
    }
    this.validateGovernanceFields(dto);
    if (dto.handlerConfig !== undefined || dto.implementationType !== undefined) {
      // When updating either field, validate the pair. If impl not provided, use existing impl below.
      // Note: validation is conservative; only external/http is strictly checked.
    }
    const skill = await this.skillsRepo.findOne({
      where: { id, companyId } as FindOptionsWhere<Skill>,
    });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在或不可编辑',
      });
    }

    if (dto.handlerConfig !== undefined || dto.implementationType !== undefined) {
      const impl = dto.implementationType ?? skill.implementationType;
      const hc = dto.handlerConfig !== undefined ? dto.handlerConfig : skill.handlerConfig ?? undefined;
      this.skillValidator.validateHandlerConfig(impl, hc ?? undefined);
    }
    Object.assign(skill, dto);
    return this.skillsRepo.save(skill);
  }

  async remove(id: string, actor: Actor): Promise<{ success: true }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({
      where: { id, companyId } as FindOptionsWhere<Skill>,
    });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在或不可删除',
      });
    }
    await this.skillsRepo.remove(skill);
    await this.skillBindingValidator.invalidateCompanyBoundSkillsCache(companyId);
    return { success: true };
  }

  async listRevisionsForTenant(skillId: string): Promise<SkillRevision[]> {
    const companyId = this.getCompanyIdOrThrow();
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    return this.revisionsRepo.find({
      where: { skillId: skill.id, companyId } as any,
      order: { version: 'DESC' as any, createdAt: 'DESC' as any },
    });
  }

  async getRevisionDiff(skillId: string, rev1Id: string, rev2Id: string): Promise<{
    skillId: string;
    fromRevisionId: string;
    toRevisionId: string;
    fieldDiffs: Array<{ path: string; type: 'added' | 'removed' | 'changed'; before: unknown; after: unknown }>;
    focus: Record<string, { before: unknown; after: unknown }>;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const skill = await this.skillsRepo.findOne({
      where: { id: skillId, companyId } as any,
      select: ['id'],
    });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    const [from, to] = await Promise.all([
      this.revisionsRepo.findOne({ where: { id: rev1Id, skillId } as any }),
      this.revisionsRepo.findOne({ where: { id: rev2Id, skillId } as any }),
    ]);
    if (!from || !to) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在或不属于该 Skill' });
    }

    const normalize = (r: SkillRevision) => ({
      version: r.version,
      name: r.name,
      description: r.description,
      implementationType: r.implementationType,
      toolSchema: r.toolSchema ?? null,
      promptTemplate: r.promptTemplate ?? null,
      handlerConfig: r.handlerConfig ?? null,
      requiredPermissions: r.requiredPermissions ?? [],
      metadata: r.metadata ?? null,
      governance:
        r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
          ? ((r.metadata as Record<string, unknown>).governance ?? null)
          : null,
      mcpTools:
        r.handlerConfig && typeof r.handlerConfig === 'object' && !Array.isArray(r.handlerConfig)
          ? ((r.handlerConfig as Record<string, unknown>).mcpTools ?? null)
          : null,
    });

    const beforeObj = normalize(from);
    const afterObj = normalize(to);
    const fieldDiffs: Array<{ path: string; type: 'added' | 'removed' | 'changed'; before: unknown; after: unknown }> = [];
    const walk = (a: unknown, b: unknown, path: string): void => {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      const aObj = a && typeof a === 'object' && !Array.isArray(a);
      const bObj = b && typeof b === 'object' && !Array.isArray(b);
      if (aObj && bObj) {
        const keys = new Set<string>([
          ...Object.keys(a as Record<string, unknown>),
          ...Object.keys(b as Record<string, unknown>),
        ]);
        for (const k of keys) {
          const next = path ? `${path}.${k}` : k;
          walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], next);
        }
        return;
      }
      const type: 'added' | 'removed' | 'changed' =
        a === undefined ? 'added' : b === undefined ? 'removed' : 'changed';
      fieldDiffs.push({ path, type, before: a, after: b });
    };
    walk(beforeObj, afterObj, '');

    return {
      skillId,
      fromRevisionId: rev1Id,
      toRevisionId: rev2Id,
      fieldDiffs,
      focus: {
        handlerConfig: { before: beforeObj.handlerConfig, after: afterObj.handlerConfig },
        governance: { before: beforeObj.governance, after: afterObj.governance },
        mcpTools: { before: beforeObj.mcpTools, after: afterObj.mcpTools },
      },
    };
  }

  async importRevisionFromArtifactForTenant(skillId: string, actor: Actor): Promise<{
    skillId: string;
    revisionId: string;
    version: number;
    status: string;
    artifactId: string;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    const artifactPath = (skill.metadata as any)?.artifact?.path as string | undefined;
    if (!artifactPath) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Skill metadata.artifact.path 未设置，请先上传 zip' });
    }
    const buf = await this.storage.download(companyId, artifactPath);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const info = await this.storage
      .getFileInfo(companyId, artifactPath)
      .catch(() => null);
    const artifact = await this.artifactsRepo.save(
      this.artifactsRepo.create({
        companyId,
        skillId: skill.id,
        storagePath: artifactPath,
        sha256,
        sizeBytes: info?.size != null ? String(info.size) : String(buf.length),
        contentType: info?.contentType ?? 'application/zip',
        originalName: info?.name ?? null,
        createdByUserId: actor.id ?? null,
        metadata: { source: 'tenant.importFromArtifact' },
      }),
    );
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const skillMd = entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('skill.md'));
    if (!skillMd) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'zip 中未找到 SKILL.md' });
    }
    const mdText = skillMd.getData().toString('utf-8');
    const parsed = matter(mdText);
    const fm = (parsed.data ?? {}) as Record<string, unknown>;
    const body = (parsed.content ?? '').trim();
    const nextVersionRow = await this.revisionsRepo.query(
      `SELECT COALESCE(MAX(version), 0)::int AS v FROM skill_revisions WHERE skill_id = $1`,
      [skill.id],
    );
    const nextVersion = Number(nextVersionRow?.[0]?.v ?? 0) + 1;

    const name = typeof fm.name === 'string' && fm.name.trim() ? fm.name.trim() : skill.name;
    const description =
      typeof fm.description === 'string' && fm.description.trim()
        ? fm.description.trim()
        : (skill.description ?? null);
    const implementationType =
      typeof (fm as any).implementationType === 'string' && String((fm as any).implementationType).trim()
        ? String((fm as any).implementationType).trim()
        : skill.implementationType;
    const toolSchema =
      fm.toolSchema && typeof fm.toolSchema === 'object' && !Array.isArray(fm.toolSchema)
        ? (fm.toolSchema as Record<string, unknown>)
        : skill.toolSchema;
    const handlerConfig =
      fm.handlerConfig && typeof fm.handlerConfig === 'object' && !Array.isArray(fm.handlerConfig)
        ? (fm.handlerConfig as Record<string, unknown>)
        : skill.handlerConfig;
    const requiredPermissions = Array.isArray((fm as any).requiredPermissions)
      ? (fm as any).requiredPermissions.map((x: any) => String(x))
      : (skill.requiredPermissions ?? []);
    const promptTemplate =
      typeof (fm as any).promptTemplate === 'string' && String((fm as any).promptTemplate).trim()
        ? String((fm as any).promptTemplate)
        : body || skill.promptTemplate || null;

    this.skillValidator.validateToolSchema(toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(implementationType, handlerConfig ?? undefined);
    const scan = this.skillValidator.scanSkillRisk({
      toolSchema: toolSchema ?? null,
      promptTemplate,
      name,
    });
    const rev = await this.revisionsRepo.save(
      this.revisionsRepo.create({
        skillId: skill.id,
        companyId,
        version: nextVersion,
        status: 'draft',
        reviewStatus: 'pending' as any,
        riskLevel: scan.riskLevel,
        scanResult: scan as any,
        name,
        description,
        toolSchema: toolSchema ?? null,
        promptTemplate,
        implementationType: implementationType as any,
        handlerConfig: handlerConfig ?? null,
        requiredPermissions,
        isPublic: skill.isPublic,
        isSystem: skill.isSystem,
        metadata: { ...(skill.metadata ?? {}), importedFrom: { entryName: skillMd.entryName, at: new Date().toISOString() } },
        artifactId: artifact.id,
        createdByUserId: actor.id,
      }),
    );
    await this.skillsRepo.update({ id: skill.id }, { currentRevisionId: rev.id } as any);
    return { skillId: skill.id, revisionId: rev.id, version: rev.version, status: rev.status, artifactId: artifact.id };
  }

  async publishRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    }
    if (rev.status === 'revoked') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 已 revoked，不能发布' });
    }
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能发布' });
    }
    this.skillValidator.validateToolSchema(rev.toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(rev.implementationType, rev.handlerConfig ?? undefined);

    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update(
      { id: skill.id },
      {
        publishedRevisionId: rev.id,
        currentRevisionId: rev.id,
        name: rev.name,
        description: rev.description,
        toolSchema: rev.toolSchema,
        promptTemplate: rev.promptTemplate,
        implementationType: rev.implementationType as any,
        handlerConfig: rev.handlerConfig,
        requiredPermissions: rev.requiredPermissions ?? [],
        version: rev.version,
      } as any,
    );
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }

  async reviewRevisionForTenant(
    skillId: string,
    revisionId: string,
    actor: Actor,
    input: { action: 'approve' | 'reject'; comment?: string | null },
  ): Promise<{ revisionId: string; reviewStatus: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    const reviewStatus = input.action === 'approve' ? 'approved' : 'rejected';
    await this.revisionsRepo.update(
      { id: rev.id },
      {
        reviewStatus,
        reviewComment: input.comment ?? null,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
      } as any,
    );
    return { revisionId: rev.id, reviewStatus };
  }

  async revokeRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ revisionId: string; status: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    await this.revisionsRepo.update({ id: rev.id }, { status: 'revoked' } as any);
    if (skill.publishedRevisionId === rev.id) {
      const fallback = await this.revisionsRepo.findOne({
        where: { skillId: skill.id, companyId, status: 'published', reviewStatus: 'approved' } as any,
        order: { version: 'DESC' as any },
      });
      await this.skillsRepo.update(
        { id: skill.id },
        {
          publishedRevisionId: fallback?.id ?? null,
          currentRevisionId: fallback?.id ?? null,
        } as any,
      );
    }
    return { revisionId: rev.id, status: 'revoked' };
  }

  async rollbackRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能回滚发布' });
    }
    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update({ id: skill.id }, { publishedRevisionId: rev.id, currentRevisionId: rev.id } as any);
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }
}
