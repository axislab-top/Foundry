import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantContextService } from '@service/tenant';
import { Repository } from 'typeorm';
import { SkillMcpToolBinding } from '../skills/entities/skill-mcp-tool-binding.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminUser } from '../admin-users/entities/admin-user.entity.js';
import { McpTool } from './entities/mcp-tool.entity.js';
import { McpToolVersion } from './entities/mcp-tool-version.entity.js';

interface ActorLike {
  id?: string;
  roles?: string[];
}

function assertAdmin(actor?: ActorLike): void {
  const roles = actor?.roles ?? [];
  if (roles.includes('admin') || roles.includes('superadmin')) return;
  throw new ForbiddenException('Only superadmin/company admin can manage MCP tools');
}

@Injectable()
export class McpToolsService {
  constructor(
    @InjectRepository(McpTool) private readonly mcpToolsRepo: Repository<McpTool>,
    @InjectRepository(McpToolVersion) private readonly versionsRepo: Repository<McpToolVersion>,
    @InjectRepository(SkillMcpToolBinding) private readonly bindingsRepo: Repository<SkillMcpToolBinding>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(AdminUser) private readonly adminUsersRepo: Repository<AdminUser>,
    private readonly tenantContext: TenantContextService,
  ) {}

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

  private async appendVersion(tool: McpTool, actorId?: string): Promise<void> {
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
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          securityProfile: tool.securityProfile,
          requiredPermissions: tool.requiredPermissions ?? [],
          isEnabled: tool.isEnabled,
          approvalStatus: tool.approvalStatus,
          approvalRequestId: tool.approvalRequestId,
          serverRef: tool.serverRef,
          transport: tool.transport,
          scope: tool.scope,
          endpointUrl: tool.endpointUrl,
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

  async list(params: { search?: string; page?: number; pageSize?: number }, actor?: ActorLike) {
    assertAdmin(actor);
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const companyId = this.tenantContext.getCompanyId() || null;

    const qb = this.mcpToolsRepo.createQueryBuilder('m');
    if (companyId) {
      qb.where('(m.company_id = :companyId OR m.company_id IS NULL)', { companyId });
    }
    if (params.search?.trim()) {
      qb.andWhere(
        '(m.name ILIKE :s OR m.display_name ILIKE :s OR m.description ILIKE :s OR m.server_ref ILIKE :s OR m.id::text ILIKE :s)',
        { s: `%${params.search.trim()}%` },
      );
    }
    qb.orderBy('m.updated_at', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const ids = items.map((x) => x.id);
    const bindCounts: Record<string, number> = {};
    if (ids.length) {
      const rows = await this.bindingsRepo.query(
        `
          SELECT mcp_tool_id AS "toolId", COUNT(*)::int AS "cnt"
          FROM skill_mcp_tool_bindings
          WHERE mcp_tool_id = ANY($1::uuid[])
          GROUP BY mcp_tool_id
        `,
        [ids],
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

  async findOne(id: string, actor?: ActorLike): Promise<McpTool> {
    assertAdmin(actor);
    const row = await this.mcpToolsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('MCP tool not found');
    return row;
  }

  async create(
    dto: {
      companyId?: string | null;
      name: string;
      displayName: string;
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown> | null;
      securityProfile: McpTool['securityProfile'];
      requiredPermissions?: string[];
      isEnabled?: boolean;
      serverRef?: string | null;
      transport?: McpTool['transport'] | null;
      scope?: McpTool['scope'] | null;
      endpointUrl?: string | null;
      changeReason: string;
    },
    actor?: ActorLike,
  ): Promise<McpTool> {
    assertAdmin(actor);
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);
    const companyId =
      dto.companyId === null ? null : String(dto.companyId ?? '').trim() || this.tenantContext.getCompanyId() || null;

    const name = this.ensureText('name', dto.name)!;
    const displayName = this.ensureText('displayName', dto.displayName)!;
    const description = this.ensureText('description', dto.description)!;
    const inputSchema = this.ensureObject('inputSchema', dto.inputSchema)!;
    const outputSchema = this.ensureObject('outputSchema', dto.outputSchema, false);
    const changeReason = this.ensureText('changeReason', dto.changeReason)!;

    const existing = await this.mcpToolsRepo.findOne({ where: { companyId, name } as any });
    if (existing) throw new BadRequestException('MCP tool name already exists');

    const saved = await this.mcpToolsRepo.save(
      this.mcpToolsRepo.create({
        companyId,
        name,
        displayName,
        description,
        inputSchema,
        outputSchema,
        securityProfile: dto.securityProfile,
        requiredPermissions: (dto.requiredPermissions ?? []).map((x) => String(x).trim()).filter(Boolean),
        isEnabled: !!dto.isEnabled,
        approvalStatus: 'none',
        approvalRequestId: null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        createdByAdmin: actorAdminId,
        updatedByAdmin: actorAdminId,
        serverRef: this.ensureText('serverRef', dto.serverRef ?? '', false),
        transport: (dto.transport ?? null) as any,
        scope: (dto.scope ?? null) as any,
        endpointUrl: this.ensureText('endpointUrl', dto.endpointUrl ?? '', false),
        runnerCommand: null,
        version: 1,
        // mcp_tools table doesn't currently have change_reason column in older migrations,
        // but Plan A migration adds it via tools; for MCP we keep changeReason in snapshot only.
      } as any),
    );
    const row = Array.isArray(saved) ? saved[0]! : saved;
    (row as any).changeReason = changeReason;
    await this.appendVersion(row, actorUserId ?? undefined);
    await this.versionsRepo.update({ toolId: row.id, version: row.version } as any, { createdByAdmin: actorAdminId } as any);
    return row;
  }

  async update(
    id: string,
    dto: Partial<{
      displayName: string;
      description: string;
      inputSchema: Record<string, unknown> | null;
      outputSchema: Record<string, unknown> | null;
      securityProfile: McpTool['securityProfile'];
      requiredPermissions: string[];
      isEnabled: boolean;
      serverRef: string | null;
      transport: McpTool['transport'] | null;
      scope: McpTool['scope'] | null;
      endpointUrl: string | null;
      changeReason: string;
    }>,
    actor?: ActorLike,
  ): Promise<McpTool> {
    assertAdmin(actor);
    const row = await this.mcpToolsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('MCP tool not found');
    const [actorUserId, actorAdminId] = await Promise.all([
      this.resolveUserIdOrNull(actor?.id),
      this.resolveAdminUserIdOrNull(actor?.id),
    ]);

    const changeReason = this.ensureText('changeReason', dto.changeReason ?? '', false) ?? 'MCP tool configuration updated';

    if (dto.displayName !== undefined) row.displayName = this.ensureText('displayName', dto.displayName)!;
    if (dto.description !== undefined) row.description = this.ensureText('description', dto.description)!;
    if (dto.inputSchema !== undefined && dto.inputSchema !== null) row.inputSchema = this.ensureObject('inputSchema', dto.inputSchema)!;
    if (dto.outputSchema !== undefined) row.outputSchema = this.ensureObject('outputSchema', dto.outputSchema, false);
    if (dto.securityProfile !== undefined) row.securityProfile = dto.securityProfile;
    if (dto.requiredPermissions !== undefined) row.requiredPermissions = dto.requiredPermissions.map((x) => String(x).trim()).filter(Boolean);
    if (dto.isEnabled !== undefined) row.isEnabled = !!dto.isEnabled;
    if (dto.serverRef !== undefined) row.serverRef = this.ensureText('serverRef', dto.serverRef ?? '', false);
    if (dto.transport !== undefined) row.transport = (dto.transport ?? null) as any;
    if (dto.scope !== undefined) row.scope = (dto.scope ?? null) as any;
    if (dto.endpointUrl !== undefined) row.endpointUrl = this.ensureText('endpointUrl', dto.endpointUrl ?? '', false);

    row.updatedBy = actorUserId;
    row.updatedByAdmin = actorAdminId;
    row.approvalStatus = 'none';
    row.approvalRequestId = null;
    row.version += 1;

    const saved = await this.mcpToolsRepo.save(row);
    (saved as any).changeReason = changeReason;
    await this.appendVersion(saved, actorUserId ?? undefined);
    await this.versionsRepo.update({ toolId: saved.id, version: saved.version } as any, { createdByAdmin: actorAdminId } as any);
    return saved;
  }

  async remove(id: string, actor?: ActorLike): Promise<void> {
    assertAdmin(actor);
    const row = await this.mcpToolsRepo.findOne({ where: { id } });
    if (!row) return;
    const bindCount = await this.bindingsRepo.count({ where: { mcpToolId: id } as any });
    if (bindCount > 0) {
      throw new BadRequestException(`MCP tool is bound by ${bindCount} skills; unbind first`);
    }
    await this.mcpToolsRepo.delete({ id });
  }

  async listVersions(id: string, actor?: ActorLike): Promise<McpToolVersion[]> {
    assertAdmin(actor);
    return this.versionsRepo.find({ where: { toolId: id }, order: { version: 'DESC' as any } });
  }

  async testConnection(id: string, actor?: ActorLike): Promise<{ ok: boolean; message: string; statusCode?: number; endpoint?: string; transport?: string }> {
    assertAdmin(actor);
    const tool = await this.findOne(id, actor);
    const transport = String(tool.transport ?? '').trim().toLowerCase();
    const endpoint = String(tool.endpointUrl ?? '').trim();
    const serverRef = String(tool.serverRef ?? tool.name ?? '').trim();

    if (!transport) {
      return { ok: false, message: 'Missing transport', transport };
    }
    if (transport === 'stdio') {
      return { ok: true, message: `STDIO transport configured for ${serverRef}.`, transport };
    }
    if (!endpoint) {
      return { ok: false, message: `Missing endpointUrl for ${serverRef}.`, transport };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json, text/event-stream, */*' },
      });
      return {
        ok: response.ok,
        message: response.ok ? `Connection test passed (${response.status})` : `Connection test failed (${response.status})`,
        statusCode: response.status,
        endpoint,
        transport,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Connection test error: ${msg}`, endpoint, transport };
    } finally {
      clearTimeout(timeout);
    }
  }
}

