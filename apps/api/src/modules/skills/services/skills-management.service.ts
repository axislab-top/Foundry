import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { SkillToolSnapshot } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import {
  BindToolsDto,
  BindMcpToolsDto,
  CreateSkillManagementDto,
  QuerySkillManagementDto,
  UpdateSkillManagementDto,
} from '../dto/skills-management.dto.js';
import { SkillMcpToolBinding } from '../entities/skill-mcp-tool-binding.entity.js';
import { SkillToolBinding } from '../entities/skill-tool-binding.entity.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillVersion } from '../entities/skill-version.entity.js';
import { Tool } from '../../tools/entities/tool.entity.js';
import { McpTool } from '../../mcp-tools/entities/mcp-tool.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { AdminUser } from '../../admin-users/entities/admin-user.entity.js';
import { SkillMdBridgeService } from '../skill-md/skill-md-bridge.service.js';
import type { SkillMdValidationIssue } from '@foundry/skill-md';

interface ActorLike {
  id?: string;
  roles?: string[];
}

@Injectable()
export class SkillsManagementService {
  constructor(
    @InjectRepository(Skill) private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillVersion) private readonly versionsRepo: Repository<SkillVersion>,
    @InjectRepository(SkillMcpToolBinding) private readonly mcpBindingsRepo: Repository<SkillMcpToolBinding>,
    @InjectRepository(SkillToolBinding) private readonly toolBindingsRepo: Repository<SkillToolBinding>,
    @InjectRepository(Tool) private readonly toolsRepo: Repository<Tool>,
    @InjectRepository(McpTool) private readonly mcpToolsRepo: Repository<McpTool>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(AdminUser) private readonly adminUsersRepo: Repository<AdminUser>,
    private readonly tenantContext: TenantContextService,
    private readonly messaging: MessagingService,
    private readonly skillMdBridge: SkillMdBridgeService,
  ) {}

  parseSkillMdDocument(raw: string): {
    issues: SkillMdValidationIssue[];
    payload?: import('@foundry/skill-md').SkillMdDbPayload;
  } {
    return this.skillMdBridge.parse(raw);
  }

  private hasRole(actor: ActorLike | undefined, role: string): boolean {
    return (actor?.roles ?? []).includes(role);
  }

  private assertAdmin(actor?: ActorLike): void {
    if (this.hasRole(actor, 'admin') || this.hasRole(actor, 'superadmin')) return;
    throw new ForbiddenException('Only superadmin/company admin can manage skills');
  }

  private ensureText(name: string, value: unknown, required = true): string | null {
    const v = String(value ?? '').trim();
    if (required && !v) throw new BadRequestException(`${name} is required`);
    return v || null;
  }

  private ensureObject(name: string, value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${name} must be a JSON object`);
    }
    return value as Record<string, unknown>;
  }

  private async resolveUserIdOrNull(actorId?: string): Promise<string | null> {
    const id = String(actorId ?? '').trim();
    if (!id) return null;
    // Admin actor may come from `admin_users`, but governance FKs reference `users`.
    const exists = await this.usersRepo.exist({ where: { id } as any });
    return exists ? id : null;
  }

  private async resolveAdminUserIdOrNull(actorId?: string): Promise<string | null> {
    const id = String(actorId ?? '').trim();
    if (!id) return null;
    const exists = await this.adminUsersRepo.exist({ where: { id } as any });
    return exists ? id : null;
  }

  private validateGovernanceFields(input: {
    maxInputTokens?: number | null;
    maxOutputTokens?: number | null;
    maxInputSizeBytes?: number | null;
    timeoutSeconds?: number | null;
    chunkStrategy?: string | null;
    category?: string[] | null;
    icon?: string | null;
  }): void {
    const checkIntRange = (name: string, value: number | null | undefined, min: number, max: number) => {
      if (value === undefined || value === null) return;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new BadRequestException(`${name} must be integer ${min}..${max}`);
      }
    };
    checkIntRange('maxInputTokens', input.maxInputTokens, 100, 128_000);
    checkIntRange('maxOutputTokens', input.maxOutputTokens, 1, 128_000);
    checkIntRange('maxInputSizeBytes', input.maxInputSizeBytes, 1_024, 50 * 1024 * 1024);
    checkIntRange('timeoutSeconds', input.timeoutSeconds, 1, 3_600);
    if (input.chunkStrategy !== undefined && input.chunkStrategy !== null) {
      const s = String(input.chunkStrategy).trim();
      if (!['none', 'fixed', 'semantic'].includes(s)) {
        throw new BadRequestException('chunkStrategy must be one of none|fixed|semantic');
      }
    }
    if (input.category !== undefined && input.category !== null) {
      if (!Array.isArray(input.category) || input.category.some((x) => !String(x ?? '').trim())) {
        throw new BadRequestException('category must be non-empty string[]');
      }
      if (input.category.length > 16) {
        throw new BadRequestException('category max length is 16');
      }
    }
    if (input.icon !== undefined && input.icon !== null && String(input.icon).length > 2048) {
      throw new BadRequestException('icon max length is 2048');
    }
  }

  private async enforceApprovalPolicy(params: {
    actor?: ActorLike;
    changeReason?: string;
  }): Promise<void> {
    if (!(this.hasRole(params.actor, 'admin') || this.hasRole(params.actor, 'superadmin'))) {
      throw new ForbiddenException('Skill management requires admin/superadmin');
    }
    const reason = String(params.changeReason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('changeReason is required');
    }
  }

  private async appendVersion(skill: Skill, actorUserId?: string | null): Promise<void> {
    const [mcpBindings, toolBindings] = await Promise.all([
      this.mcpBindingsRepo.find({
        where: { skillId: skill.id },
        order: { position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
      this.toolBindingsRepo.find({
        where: { skillId: skill.id },
        order: { position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
    ]);
    await this.versionsRepo.save(
      this.versionsRepo.create({
        skillId: skill.id,
        companyId: skill.companyId,
        version: skill.version,
        snapshot: {
          id: skill.id,
          companyId: skill.companyId,
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          promptTemplate: skill.promptTemplate,
          inputSchema: skill.inputSchema,
          outputSchema: skill.outputSchema,
          securityProfile: skill.securityProfile,
          requiredPermissions: skill.requiredPermissions ?? [],
          isEnabled: skill.isEnabled,
          approvalStatus: skill.approvalStatus,
          approvalRequestId: skill.approvalRequestId,
          changeReason: skill.changeReason,
          associatedToolIds: toolBindings.map((b) => b.toolId),
          associatedMcpToolIds: mcpBindings.map((b) => b.mcpToolId),
          // P0 governance snapshot
          maxInputTokens: (skill as any).maxInputTokens ?? null,
          maxOutputTokens: (skill as any).maxOutputTokens ?? null,
          maxInputSizeBytes: (skill as any).maxInputSizeBytes ?? null,
          timeoutSeconds: (skill as any).timeoutSeconds ?? null,
          chunkStrategy: (skill as any).chunkStrategy ?? null,
          category: (skill as any).category ?? null,
          icon: (skill as any).icon ?? null,
          updatedAt: skill.updatedAt?.toISOString?.() ?? null,
        },
        createdBy: actorUserId ?? null,
      }),
    );
  }

  private async appendVersionAdmin(skill: Skill, adminActorId?: string | null): Promise<void> {
    if (!adminActorId) return;
    await this.versionsRepo.update(
      { skillId: skill.id, version: skill.version } as any,
      { createdByAdmin: adminActorId } as any,
    );
  }

  private async publishSkillsChangedEvent(params: {
    companyId: string | null;
    skillId?: string;
    name?: string;
    action: 'created' | 'updated' | 'deleted' | 'bind_mcp_tools';
  }): Promise<void> {
    const event = {
      eventId: randomUUID(),
      eventType: 'skill.config.changed',
      aggregateId: params.skillId ?? params.name ?? randomUUID(),
      aggregateType: 'skill',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId ?? 'platform',
      data: {
        companyId: params.companyId,
        skillId: params.skillId ?? null,
        name: params.name ?? null,
        action: params.action,
        changedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(event as any, { routingKey: event.eventType, persistent: true });
  }

  private normalizeIds(ids: unknown[] | undefined | null): string[] {
    return [...new Set((ids ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
  }

  private resolveToolBindingInputs(
    dto: BindToolsDto & {
      bindings?: Array<{
        toolId: string;
        position?: number;
        isOverridden?: boolean;
        configOverride?: Record<string, unknown> | null;
      }>;
    },
  ): Array<{
    toolId: string;
    position?: number;
    isOverridden?: boolean;
    configOverride?: Record<string, unknown> | null;
  }> {
    if (Array.isArray(dto.bindings)) {
      return dto.bindings;
    }
    return (dto.toolIds ?? []).map((toolId, position) => ({ toolId, position }));
  }

  private resolveMcpBindingInputs(
    dto: BindMcpToolsDto & {
      bindings?: Array<{
        mcpToolId: string;
        position?: number;
        isOverridden?: boolean;
        configOverride?: Record<string, unknown> | null;
      }>;
    },
  ): Array<{
    mcpToolId: string;
    position?: number;
    isOverridden?: boolean;
    configOverride?: Record<string, unknown> | null;
  }> {
    if (Array.isArray(dto.bindings)) {
      return dto.bindings;
    }
    return (dto.mcpToolIds ?? []).map((mcpToolId, position) => ({ mcpToolId, position }));
  }

  private async replaceMcpBindings(params: {
    skillId: string;
    companyId: string | null;
    bindings: Array<{
      mcpToolId: string;
      position?: number;
      isOverridden?: boolean;
      configOverride?: Record<string, unknown> | null;
    }>;
    actorId?: string;
  }): Promise<void> {
    const normalized = params.bindings
      .map((b, idx) => ({
        mcpToolId: String(b.mcpToolId ?? '').trim(),
        position: typeof b.position === 'number' ? b.position : idx,
        isOverridden: !!b.isOverridden,
        configOverride: b.configOverride ?? null,
      }))
      .filter((b) => b.mcpToolId)
      .sort((a, b) => a.position - b.position);

    const seen = new Set<string>();
    const uniq = normalized.filter((b) => {
      if (seen.has(b.mcpToolId)) return false;
      seen.add(b.mcpToolId);
      return true;
    });

    if (uniq.length) {
      const rows = await this.mcpToolsRepo.find({ where: { id: In(uniq.map((b) => b.mcpToolId)) } as any });
      const found = new Set(rows.map((r) => r.id));
      const missing = uniq.map((b) => b.mcpToolId).filter((id) => !found.has(id));
      if (missing.length) throw new BadRequestException(`MCP tools not found: ${missing.join(', ')}`);
    }

    await this.mcpBindingsRepo.delete({ skillId: params.skillId } as any);
    if (!uniq.length) return;

    await this.mcpBindingsRepo.save(
      uniq.map((binding, idx) => ({
        companyId: params.companyId,
        skillId: params.skillId,
        mcpToolId: binding.mcpToolId,
        position: idx,
        isOverridden: binding.isOverridden,
        configOverride: binding.configOverride,
        createdBy: params.actorId ?? null,
      })),
    );
  }

  private async replaceToolBindings(params: {
    skillId: string;
    companyId: string | null;
    bindings: Array<{
      toolId: string;
      position?: number;
      isOverridden?: boolean;
      configOverride?: Record<string, unknown> | null;
    }>;
    actorId?: string;
  }): Promise<void> {
    const normalized = params.bindings
      .map((b, idx) => ({
        toolId: String(b.toolId ?? '').trim(),
        position: typeof b.position === 'number' ? b.position : idx,
        isOverridden: !!b.isOverridden,
        configOverride: b.configOverride ?? null,
      }))
      .filter((b) => b.toolId)
      .sort((a, b) => a.position - b.position);

    const seen = new Set<string>();
    const uniq = normalized.filter((b) => {
      if (seen.has(b.toolId)) return false;
      seen.add(b.toolId);
      return true;
    });

    if (uniq.length) {
      const rows = await this.toolsRepo.find({ where: { id: In(uniq.map((b) => b.toolId)) } as any });
      const found = new Set(rows.map((r) => r.id));
      const missing = uniq.map((b) => b.toolId).filter((id) => !found.has(id));
      if (missing.length) throw new BadRequestException(`Tools not found: ${missing.join(', ')}`);
    }

    await this.toolBindingsRepo.delete({ skillId: params.skillId } as any);
    if (!uniq.length) return;

    await this.toolBindingsRepo.save(
      uniq.map((binding, idx) => ({
        companyId: params.companyId,
        skillId: params.skillId,
        toolId: binding.toolId,
        position: idx,
        isOverridden: binding.isOverridden,
        configOverride: binding.configOverride,
        createdBy: params.actorId ?? null,
      })),
    );
  }

  async create(dto: CreateSkillManagementDto, actor?: ActorLike): Promise<Skill> {
    this.assertAdmin(actor);
    const companyId =
      dto.companyId === null ? null : String(dto.companyId ?? '').trim() || this.tenantContext.getCompanyId() || null;
    const reason = this.ensureText('changeReason', dto.changeReason);
    if (!reason) throw new BadRequestException('changeReason is required');

    const skillMdRaw = String((dto as { skillMd?: string }).skillMd ?? '').trim();
    let name: string;
    let displayName: string;
    let description: string | null;
    let promptTemplate: string;
    let toolSchema: Record<string, unknown>;
    let inputSchema: Record<string, unknown>;
    let implementationType: Skill['implementationType'];
    let category: string[] | null;
    let icon: string | null;
    let metadata: Record<string, unknown> | null = null;

    if (skillMdRaw) {
      const parsed = this.skillMdBridge.parse(skillMdRaw);
      if (parsed.issues.length || !parsed.payload) {
        throw new BadRequestException(
          parsed.issues.map((i) => `${i.field}: ${i.message}`).join('; ') || 'Invalid SKILL.md',
        );
      }
      const p = parsed.payload;
      name = p.name;
      displayName = p.displayName;
      description = p.description;
      promptTemplate = p.promptTemplate;
      toolSchema = p.toolSchema;
      inputSchema = p.inputSchema;
      implementationType = p.implementationType;
      category = p.category;
      icon = p.icon;
      metadata = p.metadata;
    } else {
      if (!dto.name?.trim() || !dto.displayName?.trim() || !dto.promptTemplate?.trim()) {
        throw new BadRequestException(
          'Either skillMd or name, displayName, and promptTemplate are required',
        );
      }
      name = this.ensureText('name', dto.name)!;
      displayName = this.ensureText('displayName', dto.displayName)!;
      promptTemplate = this.ensureText('promptTemplate', dto.promptTemplate)!;
      description = this.ensureText('description', dto.description ?? '', false);
      toolSchema = this.ensureObject('inputSchema', dto.inputSchema);
      inputSchema = toolSchema;
      const impl = String((dto as { implementationType?: string }).implementationType ?? 'prompt').trim();
      implementationType = (
        ['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp'].includes(impl)
          ? impl
          : 'prompt'
      ) as Skill['implementationType'];
      category = (dto as any).category ?? null;
      icon = (dto as any).icon ?? null;
    }

    this.validateGovernanceFields(dto as any);

    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    const row = await this.skillsRepo.save(
      this.skillsRepo.create({
        companyId,
        name,
        displayName,
        description,
        promptTemplate,
        toolSchema,
        inputSchema,
        outputSchema: this.ensureObject('outputSchema', dto.outputSchema),
        securityProfile: dto.securityProfile,
        requiredPermissions: (dto.requiredPermissions ?? []).map((x) => x.trim()).filter(Boolean),
        implementationType,
        isEnabled: false,
        approvalRequestId: null,
        approvalStatus: 'none',
        changeReason: reason,
        version: 1,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        createdByAdmin: actorAdminId,
        updatedByAdmin: actorAdminId,

        // P0 governance fields
        maxInputTokens: (dto as any).maxInputTokens ?? null,
        maxOutputTokens: (dto as any).maxOutputTokens ?? null,
        maxInputSizeBytes: (dto as any).maxInputSizeBytes ?? null,
        timeoutSeconds: (dto as any).timeoutSeconds ?? 300,
        chunkStrategy: (dto as any).chunkStrategy ?? 'none',
        category,
        icon,
        metadata,
      }),
    );
    await this.appendVersion(row, actorUserId);
    await this.appendVersionAdmin(row, actorAdminId);
    await this.publishSkillsChangedEvent({ companyId, skillId: row.id, name: row.name, action: 'created' });
    return row;
  }

  async update(id: string, dto: UpdateSkillManagementDto, actor?: ActorLike): Promise<Skill> {
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    this.assertAdmin(actor);
    const row = await this.skillsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Skill not found');
    const changeReason = this.ensureText('changeReason', dto.changeReason ?? '', false) ?? 'Skill configuration updated';
    await this.enforceApprovalPolicy({
      actor,
      changeReason,
    });
    this.validateGovernanceFields(dto as any);

    const skillMdRaw = String((dto as { skillMd?: string }).skillMd ?? '').trim();
    if (skillMdRaw) {
      const parsed = this.skillMdBridge.parse(skillMdRaw);
      if (parsed.issues.length || !parsed.payload) {
        throw new BadRequestException(
          parsed.issues.map((i) => `${i.field}: ${i.message}`).join('; ') || 'Invalid SKILL.md',
        );
      }
      this.skillMdBridge.applyPayloadToSkillRow(row, parsed.payload);
    } else {
      if (dto.displayName !== undefined) row.displayName = this.ensureText('displayName', dto.displayName)!;
      if (dto.description !== undefined) row.description = this.ensureText('description', dto.description, false);
      if (dto.promptTemplate !== undefined) row.promptTemplate = this.ensureText('promptTemplate', dto.promptTemplate)!;
      if (dto.inputSchema !== undefined) {
        row.inputSchema = this.ensureObject('inputSchema', dto.inputSchema);
        row.toolSchema = row.inputSchema;
      }
    }
    if (dto.outputSchema !== undefined) row.outputSchema = this.ensureObject('outputSchema', dto.outputSchema);
    if (dto.securityProfile !== undefined) row.securityProfile = dto.securityProfile;
    if (dto.requiredPermissions !== undefined) {
      row.requiredPermissions = dto.requiredPermissions.map((x) => x.trim()).filter(Boolean);
    }
    if (dto.isEnabled !== undefined) row.isEnabled = !!dto.isEnabled;
    // P0 governance fields
    if ((dto as any).maxInputTokens !== undefined) (row as any).maxInputTokens = (dto as any).maxInputTokens;
    if ((dto as any).maxOutputTokens !== undefined) (row as any).maxOutputTokens = (dto as any).maxOutputTokens;
    if ((dto as any).maxInputSizeBytes !== undefined) (row as any).maxInputSizeBytes = (dto as any).maxInputSizeBytes;
    if ((dto as any).timeoutSeconds !== undefined) (row as any).timeoutSeconds = (dto as any).timeoutSeconds ?? 300;
    if ((dto as any).chunkStrategy !== undefined) (row as any).chunkStrategy = (dto as any).chunkStrategy ?? 'none';
    if ((dto as any).category !== undefined) (row as any).category = (dto as any).category;
    if ((dto as any).icon !== undefined) (row as any).icon = (dto as any).icon;
    row.approvalRequestId = null;
    row.approvalStatus = 'none';
    row.changeReason = changeReason;
    row.version += 1;
    row.updatedBy = actorUserId;
    row.updatedByAdmin = actorAdminId;
    const saved = await this.skillsRepo.save(row);
    await this.appendVersion(saved, actorUserId);
    await this.appendVersionAdmin(saved, actorAdminId);
    await this.publishSkillsChangedEvent({
      companyId: saved.companyId,
      skillId: saved.id,
      name: saved.name,
      action: 'updated',
    });
    return saved;
  }

  async list(query: QuerySkillManagementDto, actor?: ActorLike) {
    this.assertAdmin(actor);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const companyId = this.tenantContext.getCompanyId() || null;
    const qb = this.skillsRepo.createQueryBuilder('s');
    const companyScope = String(query.companyScope ?? 'all').trim();
    if (companyScope === 'platform') {
      qb.where('s.company_id IS NULL');
    } else if (companyScope === 'company') {
      if (!companyId) throw new BadRequestException('company scope requires companyId context');
      qb.where('s.company_id = :companyId', { companyId });
    } else if (companyId) {
      qb.where(
        new Brackets((w) => {
          w.where('s.company_id = :companyId', { companyId }).orWhere('s.company_id IS NULL');
        }),
      );
    } else {
      // 管理端无当前租户上下文：`all` 应列出全库技能（各公司 + 平台全局），
      // 否则与「仅 company_id IS NULL」的全局技能列表完全重复。
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(s.name ILIKE :s OR s.display_name ILIKE :s OR s.description ILIKE :s OR s.id::text ILIKE :s)',
        { s: `%${query.search.trim()}%` },
      );
    }
    if (typeof query.isEnabled === 'boolean') qb.andWhere('s.is_enabled = :isEnabled', { isEnabled: query.isEnabled });
    if (query.approvalStatus && query.approvalStatus !== 'all') {
      qb.andWhere('s.approval_status = :approvalStatus', { approvalStatus: query.approvalStatus });
    }
    qb.orderBy('s.updated_at', 'DESC');
    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  async findOne(id: string, actor?: ActorLike): Promise<Skill> {
    this.assertAdmin(actor);
    const row = await this.skillsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Skill not found');
    return row;
  }

  async getAdminDetail(id: string, actor?: ActorLike): Promise<{
    skill: Skill;
    skillMd: string;
    toolBindings: Array<{
      id: string;
      toolId: string;
      position: number;
      isOverridden: boolean;
      configOverride: Record<string, unknown> | null;
      tool: Tool;
    }>;
    mcpToolBindings: Array<{
      id: string;
      mcpToolId: string;
      position: number;
      isOverridden: boolean;
      configOverride: Record<string, unknown> | null;
      mcpTool: McpTool;
    }>;
  }> {
    this.assertAdmin(actor);
    const skill = await this.findOne(id, actor);

    const [toolBindings, mcpBindings] = await Promise.all([
      this.toolBindingsRepo.find({
        where: { skillId: skill.id } as any,
        order: { position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
      this.mcpBindingsRepo.find({
        where: { skillId: skill.id } as any,
        order: { position: 'ASC' as any, createdAt: 'ASC' as any },
      }),
    ]);

    const toolIds = toolBindings.map((b) => b.toolId);
    const mcpToolIds = mcpBindings.map((b) => b.mcpToolId);

    const [tools, mcpTools] = await Promise.all([
      toolIds.length ? this.toolsRepo.find({ where: { id: In(toolIds) } as any }) : Promise.resolve([]),
      mcpToolIds.length ? this.mcpToolsRepo.find({ where: { id: In(mcpToolIds) } as any }) : Promise.resolve([]),
    ]);

    const toolsById = new Map(tools.map((t) => [t.id, t]));
    const mcpById = new Map(mcpTools.map((t) => [t.id, t]));

    return {
      skill,
      skillMd: this.skillMdBridge.toSkillMd(skill),
      toolBindings: toolBindings
        .map((b) => {
          const tool = toolsById.get(b.toolId);
          if (!tool) return null;
          return {
            id: b.id,
            toolId: b.toolId,
            position: b.position,
            isOverridden: b.isOverridden,
            configOverride: b.configOverride,
            tool,
          };
        })
        .filter(Boolean) as any,
      mcpToolBindings: mcpBindings
        .map((b) => {
          const mcpTool = mcpById.get(b.mcpToolId);
          if (!mcpTool) return null;
          return {
            id: b.id,
            mcpToolId: b.mcpToolId,
            position: b.position,
            isOverridden: b.isOverridden,
            configOverride: b.configOverride,
            mcpTool,
          };
        })
        .filter(Boolean) as any,
    };
  }

  async remove(id: string, actor?: ActorLike): Promise<void> {
    this.assertAdmin(actor);
    const row = await this.skillsRepo.findOne({ where: { id } });
    if (!row) return;
    await this.skillsRepo.delete({ id });
    await this.publishSkillsChangedEvent({
      companyId: row.companyId,
      skillId: row.id,
      name: row.name,
      action: 'deleted',
    });
  }

  async listVersions(id: string, actor?: ActorLike): Promise<SkillVersion[]> {
    this.assertAdmin(actor);
    return this.versionsRepo.find({ where: { skillId: id }, order: { version: 'DESC' } });
  }

  async bindMcpTools(id: string, dto: BindMcpToolsDto, actor?: ActorLike) {
    this.assertAdmin(actor);
    const row = await this.skillsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Skill not found');
    const changeReason = this.ensureText('changeReason', dto.changeReason ?? '', false) ?? 'Skill MCP tools binding updated';
    await this.enforceApprovalPolicy({
      actor,
      changeReason,
    });
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    await this.replaceMcpBindings({
      skillId: row.id,
      companyId: row.companyId,
      bindings: this.resolveMcpBindingInputs(dto),
      actorId: actorUserId ?? undefined,
    });
    // annotate admin actor for binding rows (best-effort)
    const adminId = actorAdminId ?? null;
    if (adminId) {
      await this.mcpBindingsRepo
        .createQueryBuilder()
        .update()
        .set({ createdByAdmin: adminId } as any)
        .where('skill_id = :skillId', { skillId: row.id })
        .execute();
    }
    row.version += 1;
    row.approvalStatus = 'none';
    row.approvalRequestId = null;
    row.changeReason = changeReason;
    row.updatedBy = actorUserId;
    row.updatedByAdmin = actorAdminId;
    const saved = await this.skillsRepo.save(row);
    await this.appendVersion(saved, actorUserId);
    await this.appendVersionAdmin(saved, actorAdminId);
    await this.publishSkillsChangedEvent({
      companyId: saved.companyId,
      skillId: saved.id,
      name: saved.name,
      action: 'bind_mcp_tools',
    });
    return saved;
  }

  async bindTools(id: string, dto: BindToolsDto, actor?: ActorLike) {
    this.assertAdmin(actor);
    const row = await this.skillsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Skill not found');
    const changeReason = this.ensureText('changeReason', dto.changeReason ?? '', false) ?? 'Skill tools binding updated';
    await this.enforceApprovalPolicy({
      actor,
      changeReason
    });
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    await this.replaceToolBindings({
      skillId: row.id,
      companyId: row.companyId,
      bindings: this.resolveToolBindingInputs(dto),
      actorId: actorUserId ?? undefined,
    });
    const adminId = actorAdminId ?? null;
    if (adminId) {
      await this.toolBindingsRepo
        .createQueryBuilder()
        .update()
        .set({ createdByAdmin: adminId } as any)
        .where('skill_id = :skillId', { skillId: row.id })
        .execute();
    }
    row.version += 1;
    row.approvalStatus = 'none';
    row.approvalRequestId = null;
    row.changeReason = changeReason;
    row.updatedBy = actorUserId;
    row.updatedByAdmin = actorAdminId;
    const saved = await this.skillsRepo.save(row);
    await this.appendVersion(saved, actorUserId);
    await this.appendVersionAdmin(saved, actorAdminId);
    await this.publishSkillsChangedEvent({
      companyId: saved.companyId,
      skillId: saved.id,
      name: saved.name,
      action: 'updated'
    });
    return saved;
  }

  async testMcpConnection(id: string, actor?: ActorLike): Promise<{
    ok: boolean;
    message: string;
    statusCode?: number;
    endpoint?: string;
    transport?: string;
  }> {
    this.assertAdmin(actor);
    // Plan A: MCP tools are first-class resources in mcp_tools table. Connection tests
    // should be performed against MCPTool endpoints, not Skill IDs.
    throw new BadRequestException('Deprecated endpoint: use MCP tools test-connection API');
  }

  async resolveSkillsForRuntime(params: {
    companyId?: string | null;
    agentId?: string;
    onlyEnabled?: boolean;
  }): Promise<SkillToolSnapshot[]> {
    const companyId = params.companyId?.trim() || null;
    const rows = await this.skillsRepo.find({
      where: companyId
        ? [
            { companyId, isEnabled: params.onlyEnabled !== false },
            { companyId: IsNull(), isEnabled: params.onlyEnabled !== false } as any,
          ]
        : [{ companyId: IsNull(), isEnabled: params.onlyEnabled !== false } as any],
      order: { updatedAt: 'DESC' },
    });
    const byName = new Map<string, Skill>();
    for (const row of rows) {
      if (!byName.has(row.name)) byName.set(row.name, row);
    }
    const latest = [...byName.values()];

    // Batch load bindings + tool records for runtime injection.
    const skillIds = latest.map((s) => s.id);
    const toolBindings = skillIds.length
      ? await this.toolBindingsRepo.find({
          where: { skillId: In(skillIds) } as any,
          order: { skillId: 'ASC' as any, position: 'ASC' as any, createdAt: 'ASC' as any },
        })
      : [];
    const toolIds = [...new Set(toolBindings.map((b) => b.toolId))];
    const tools = toolIds.length ? await this.toolsRepo.find({ where: { id: In(toolIds) } as any }) : [];
    const toolById = new Map(tools.map((t) => [t.id, t]));
    const toolBindingsBySkill = new Map<string, SkillToolBinding[]>();
    toolBindings.forEach((b) => {
      const list = toolBindingsBySkill.get(b.skillId) ?? [];
      list.push(b);
      toolBindingsBySkill.set(b.skillId, list);
    });

    const mcpBindings = skillIds.length
      ? await this.mcpBindingsRepo.find({
          where: { skillId: In(skillIds) } as any,
          order: { skillId: 'ASC' as any, position: 'ASC' as any, createdAt: 'ASC' as any },
        })
      : [];
    const mcpToolIds = [...new Set(mcpBindings.map((b) => b.mcpToolId))];
    const mcpTools = mcpToolIds.length ? await this.mcpToolsRepo.find({ where: { id: In(mcpToolIds) } as any }) : [];
    const mcpById = new Map(mcpTools.map((t) => [t.id, t]));
    const mcpBindingsBySkill = new Map<string, SkillMcpToolBinding[]>();
    mcpBindings.forEach((b) => {
      const list = mcpBindingsBySkill.get(b.skillId) ?? [];
      list.push(b);
      mcpBindingsBySkill.set(b.skillId, list);
    });

    return latest.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      toolSchema: row.inputSchema ?? row.toolSchema ?? null,
      promptTemplate: row.promptTemplate,
      implementationType: row.implementationType ?? 'builtin',
      handlerConfig: row.handlerConfig ?? null,
      requiredPermissions: row.requiredPermissions ?? [],
      version: row.version,
      semverVersion: row.semverVersion?.trim() || '1.0.0',
      isPublic: row.isPublic ?? true,
      isSystem: row.isSystem ?? false,
      boundTools: (toolBindingsBySkill.get(row.id) ?? [])
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
        })),
      // Plan A: inject bound MCP tools (runtime-ready definitions)
      boundMcpTools: (mcpBindingsBySkill.get(row.id) ?? [])
        .map((b) => mcpById.get(b.mcpToolId))
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
        })),
    }));
  }
}

