import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantContextService } from '@service/tenant';
import { Repository } from 'typeorm';
import { SkillToolBinding } from '../skills/entities/skill-tool-binding.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminUser } from '../admin-users/entities/admin-user.entity.js';
import { Tool } from './entities/tool.entity.js';
import { ToolVersion } from './entities/tool-version.entity.js';

interface ActorLike {
  id?: string;
  roles?: string[];
}

function assertAdmin(actor?: ActorLike): void {
  const roles = actor?.roles ?? [];
  if (roles.includes('admin') || roles.includes('superadmin')) return;
  throw new ForbiddenException('Only superadmin/company admin can manage tools');
}

@Injectable()
export class ToolsService {
  constructor(
    @InjectRepository(Tool) private readonly toolsRepo: Repository<Tool>,
    @InjectRepository(ToolVersion) private readonly versionsRepo: Repository<ToolVersion>,
    @InjectRepository(SkillToolBinding) private readonly bindingsRepo: Repository<SkillToolBinding>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(AdminUser) private readonly adminUsersRepo: Repository<AdminUser>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(params: { search?: string; page?: number; pageSize?: number }, actor?: ActorLike) {
    assertAdmin(actor);
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const companyId = this.tenantContext.getCompanyId() || null;

    const qb = this.toolsRepo.createQueryBuilder('t');
    if (companyId) {
      qb.where('(t.company_id = :companyId OR t.company_id IS NULL)', { companyId });
    }
    if (params.search?.trim()) {
      qb.andWhere(
        '(t.name ILIKE :s OR t.display_name ILIKE :s OR t.description ILIKE :s OR t.id::text ILIKE :s)',
        { s: `%${params.search.trim()}%` },
      );
    }
    qb.orderBy('t.updated_at', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const toolIds = items.map((t) => t.id);
    const bindCounts: Record<string, number> = {};
    if (toolIds.length) {
      const rows = await this.bindingsRepo.query(
        `
          SELECT tool_id AS "toolId", COUNT(*)::int AS "cnt"
          FROM skill_tool_bindings
          WHERE tool_id = ANY($1::uuid[])
          GROUP BY tool_id
        `,
        [toolIds],
      );
      rows.forEach((r: any) => {
        bindCounts[String(r.toolId)] = Number(r.cnt ?? 0);
      });
    }

    return {
      items: items.map((t) => ({ ...t, boundSkillCount: bindCounts[t.id] ?? 0 })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string, actor?: ActorLike): Promise<Tool> {
    assertAdmin(actor);
    const tool = await this.toolsRepo.findOne({ where: { id } });
    if (!tool) throw new NotFoundException('Tool not found');
    return tool;
  }

  private ensureText(name: string, value: unknown, required = true): string | null {
    const v = String(value ?? '').trim();
    if (required && !v) throw new BadRequestException(`${name} is required`);
    return v || null;
  }

  private ensureObject(name: string, value: unknown, required = true): Record<string, unknown> | null {
    if (value == null) {
      if (required) throw new BadRequestException(`${name} is required`);
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${name} must be a JSON object`);
    return value as Record<string, unknown>;
  }

  private async appendVersion(tool: Tool, actorId?: string): Promise<void> {
    await this.versionsRepo.save(
      this.versionsRepo.create({
        toolId: tool.id,
        companyId: tool.companyId,
        version: tool.version,
        snapshot: {
          id: tool.id,
          companyId: tool.companyId,
          name: tool.name,
          displayName: tool.displayName,
          description: tool.description,
          metadata: tool.metadata,
          implementationType: tool.implementationType,
          handlerConfig: tool.handlerConfig,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          securityProfile: tool.securityProfile,
          requiredPermissions: tool.requiredPermissions ?? [],
          isEnabled: tool.isEnabled,
          approvalStatus: tool.approvalStatus,
          approvalRequestId: tool.approvalRequestId,
          changeReason: tool.changeReason,
          semverVersion: tool.semverVersion,
          updatedAt: tool.updatedAt?.toISOString?.() ?? null,
        },
        createdBy: actorId ?? null,
      }),
    );
  }

  private async resolveUserIdOrNull(actorId?: string): Promise<string | null> {
    const id = String(actorId ?? '').trim();
    if (!id) return null;
    const exists = await this.usersRepo.exist({ where: { id } as any });
    return exists ? id : null;
  }

  private async resolveAdminUserIdOrNull(actorId?: string): Promise<string | null> {
    const id = String(actorId ?? '').trim();
    if (!id) return null;
    const exists = await this.adminUsersRepo.exist({ where: { id } as any });
    return exists ? id : null;
  }

  async create(
    dto: {
      companyId?: string | null;
      name: string;
      displayName: string;
      description: string;
      implementationType?: string;
      handlerConfig?: Record<string, unknown> | null;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown> | null;
      securityProfile?: Tool['securityProfile'];
      requiredPermissions?: string[];
      isEnabled?: boolean;
      changeReason: string;
      metadata?: Record<string, unknown> | null;
    },
    actor?: ActorLike,
  ): Promise<Tool> {
    assertAdmin(actor);
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    const companyId =
      dto.companyId === null ? null : String(dto.companyId ?? '').trim() || this.tenantContext.getCompanyId() || null;

    const changeReason = this.ensureText('changeReason', dto.changeReason)!;
    const name = this.ensureText('name', dto.name)!;
    const displayName = this.ensureText('displayName', dto.displayName)!;
    const description = this.ensureText('description', dto.description)!;
    const inputSchema = this.ensureObject('inputSchema', dto.inputSchema)!;
    const outputSchema = this.ensureObject('outputSchema', dto.outputSchema, false);
    const metadata = this.ensureObject('metadata', dto.metadata, false);

    const existing = await this.toolsRepo.findOne({ where: { companyId, name } as any });
    if (existing) throw new BadRequestException('Tool name already exists');

    const row = await this.toolsRepo.save(
      this.toolsRepo.create({
        companyId,
        name,
        displayName,
        description,
        implementationType: String(dto.implementationType ?? 'builtin'),
        handlerConfig: dto.handlerConfig ?? null,
        inputSchema,
        outputSchema,
        securityProfile: (dto.securityProfile ?? 'safe') as any,
        requiredPermissions: (dto.requiredPermissions ?? []).map((x) => String(x).trim()).filter(Boolean),
        isEnabled: !!dto.isEnabled,
        metadata,
        approvalStatus: 'none',
        approvalRequestId: null,
        changeReason,
        version: 1,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        createdByAdmin: actorAdminId,
        updatedByAdmin: actorAdminId,
      }),
    );
    await this.appendVersion(
      row,
      actorUserId ?? undefined,
    );
    await this.versionsRepo.update({ toolId: row.id, version: row.version } as any, { createdByAdmin: actorAdminId } as any);
    return row;
  }

  async update(
    id: string,
    dto: Partial<{
      displayName: string;
      description: string;
      implementationType: string;
      handlerConfig: Record<string, unknown> | null;
      inputSchema: Record<string, unknown> | null;
      outputSchema: Record<string, unknown> | null;
      securityProfile: Tool['securityProfile'];
      requiredPermissions: string[];
      isEnabled: boolean;
      semverVersion: string;
      changeReason: string;
      metadata: Record<string, unknown> | null;
    }>,
    actor?: ActorLike,
  ): Promise<Tool> {
    assertAdmin(actor);
    const row = await this.toolsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Tool not found');
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);

    const changeReason = this.ensureText('changeReason', dto.changeReason ?? '', false) ?? 'Tool configuration updated';

    if (dto.displayName !== undefined) row.displayName = this.ensureText('displayName', dto.displayName)!;
    if (dto.description !== undefined) row.description = this.ensureText('description', dto.description)!;
    if (dto.implementationType !== undefined) row.implementationType = String(dto.implementationType);
    if (dto.handlerConfig !== undefined) row.handlerConfig = dto.handlerConfig ?? null;
    if (dto.inputSchema !== undefined && dto.inputSchema !== null) row.inputSchema = this.ensureObject('inputSchema', dto.inputSchema)!;
    if (dto.outputSchema !== undefined) row.outputSchema = this.ensureObject('outputSchema', dto.outputSchema, false);
    if (dto.securityProfile !== undefined) row.securityProfile = dto.securityProfile;
    if (dto.requiredPermissions !== undefined) {
      row.requiredPermissions = dto.requiredPermissions.map((x) => String(x).trim()).filter(Boolean);
    }
    if (dto.metadata !== undefined) row.metadata = this.ensureObject('metadata', dto.metadata, false);
    if (dto.isEnabled !== undefined) row.isEnabled = !!dto.isEnabled;
    if (dto.semverVersion !== undefined) row.semverVersion = String(dto.semverVersion || '1.0.0');

    row.changeReason = changeReason;
    row.approvalStatus = 'none';
    row.approvalRequestId = null;
    row.updatedBy = actorUserId;
    row.updatedByAdmin = actorAdminId;
    row.version += 1;

    const saved = await this.toolsRepo.save(row);
    await this.appendVersion(saved, actorUserId ?? undefined);
    await this.versionsRepo.update({ toolId: saved.id, version: saved.version } as any, { createdByAdmin: actorAdminId } as any);
    return saved;
  }

  async remove(id: string, actor?: ActorLike): Promise<void> {
    assertAdmin(actor);
    const row = await this.toolsRepo.findOne({ where: { id } });
    if (!row) return;
    const bindCount = await this.bindingsRepo.count({ where: { toolId: id } as any });
    if (bindCount > 0) {
      throw new BadRequestException(`Tool is bound by ${bindCount} skills; unbind first`);
    }
    await this.toolsRepo.delete({ id });
  }

  async listVersions(id: string, actor?: ActorLike): Promise<ToolVersion[]> {
    assertAdmin(actor);
    return this.versionsRepo.find({ where: { toolId: id }, order: { version: 'DESC' as any } });
  }
}

