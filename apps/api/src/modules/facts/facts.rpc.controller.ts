import { BadRequestException, Controller, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import type {
  FactsAgentRow,
  FactsQueryResult,
  FactsQueryType,
  MemoryQueryResult,
} from '@contracts/types';
import { Agent } from '../agents/entities/agent.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { User } from '../users/entities/user.entity.js';
import { FactsService } from './facts.service.js';
import { MemoryRetrieverService } from '../memory/services/memory-retriever.service.js';
import { OrganizationService } from '../organization/services/organization.service.js';
import { OrgRosterService } from '../organization/services/org-roster.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class FactsRequesterDto {
  @IsUUID()
  agentId: string;

  @IsString()
  @IsIn(['ceo', 'director', 'employee', 'unknown'])
  role: 'ceo' | 'director' | 'employee' | 'unknown';

  @IsOptional()
  @IsString()
  departmentSlug?: string | null;

  @IsOptional()
  @IsUUID()
  userId?: string | null;
}

class FactsQueryRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  threadId?: string | null;

  @IsString()
  @MinLength(1)
  traceId: string;

  @ValidateNested()
  @Type(() => FactsRequesterDto)
  requester: FactsRequesterDto;

  @IsIn(['company_people', 'room_members', 'role_presence', 'org_structure', 'department_roster', 'node_roster'])
  queryType: FactsQueryType;

  @IsOptional()
  @IsUUID()
  organizationNodeId?: string | null;

  @IsOptional()
  @IsIn(['default', 'memory_cortex_sync', 'main_room_replay_prefetch'])
  factsClientMode?: 'default' | 'memory_cortex_sync' | 'main_room_replay_prefetch';

  @IsOptional()
  @IsString()
  roleQuery?: string | null;

  @IsOptional()
  @IsString()
  locale?: string | null;
}

class MemoryQueryScopedRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsString()
  @MinLength(1)
  traceId: string;

  @ValidateNested()
  @Type(() => FactsRequesterDto)
  requester: FactsRequesterDto;

  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  namespacesAllowed: string[];

  @IsString()
  @MinLength(1)
  query: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  topK: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  roomId?: string | null;
}

@Controller()
export class FactsRpcController {
  private readonly logger = new Logger(FactsRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly facts: FactsService,
    private readonly org: OrganizationService,
    private readonly orgRoster: OrgRosterService,
    private readonly memoryRetriever: MemoryRetrieverService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private runWithCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    return this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private assertFactsFallbackGate(dto: FactsQueryRpcDto): void {
    if (!this.config.isFactsAsFallbackOnlyEnabled()) return;
    const mode = dto.factsClientMode ?? 'default';
    if (
      dto.requester?.role !== 'ceo' ||
      mode === 'memory_cortex_sync' ||
      mode === 'main_room_replay_prefetch'
    ) {
      return;
    }
    if (dto.queryType === 'company_people' || dto.queryType === 'org_structure') {
      throw new ForbiddenException({
        code: 'FACTS_FORBIDDEN',
        message: 'CEO live company facts are disabled (FACTS_AS_FALLBACK_ONLY); use Memory Graph cortex.',
      });
    }
  }

  private assertActorAdmin(actor: ActorDto): void {
    // Worker actor is expected to be admin in async contexts; keep strict until we have explicit permission models.
    if (!actor?.id) throw new ForbiddenException('Missing actor');
    if (Array.isArray(actor.roles) && actor.roles.includes('admin')) return;
    throw new ForbiddenException('facts gateway requires admin actor context');
  }

  private async listActiveAgents(companyId: string): Promise<FactsAgentRow[]> {
    const rows = await this.agentsRepo.find({
      where: { companyId, status: 'active' } as any,
      select: ['id', 'name', 'role', 'organizationNodeId', 'metadata'] as any,
      take: 500,
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name ?? null,
      role: a.role ?? null,
      organizationNodeId: (a as any).organizationNodeId ?? null,
      departmentSlug:
        typeof (a.metadata as any)?.departmentSlug === 'string'
          ? String((a.metadata as any).departmentSlug)
          : null,
    }));
  }

  private async countActiveCompanyMembers(companyId: string): Promise<number | null> {
    // company_memberships is protected by RLS, so this must run under tenant context.
    const count = await this.membershipsRepo.count({ where: { companyId, isActive: true } as any });
    return Number.isFinite(count) ? count : null;
  }

  @MessagePattern('facts.query')
  async query(@Payload() payload: unknown): Promise<FactsQueryResult> {
    try {
      const dto = validateRpcDto(FactsQueryRpcDto, payload);
      this.assertActorAdmin(dto.actor);
      this.assertFactsFallbackGate(dto);

      return await this.runWithCompany(dto.companyId, async () => {
        this.logger.log('foundry.facts.query.started', {
          companyId: dto.companyId,
          roomId: dto.roomId ?? null,
          traceId: dto.traceId,
          queryType: dto.queryType,
          requesterRole: dto.requester?.role ?? 'unknown',
        });
        const startedAt = Date.now();
        const sourceMeta: Array<{ source: string; ok: boolean; latencyMs?: number; note?: string | null }> = [];
        const addMeta = (source: string, ok: boolean, latencyMs?: number, note?: string | null) =>
          sourceMeta.push({ source, ok, latencyMs, note: note ?? null });

        const out: FactsQueryResult = {
          queryType: dto.queryType,
          generatedAt: new Date().toISOString(),
          counts: {},
          sourceMeta,
        };

        if (dto.queryType === 'room_members') {
          if (!dto.roomId) throw new BadRequestException('roomId is required for room_members');
          const t0 = Date.now();
          const roomMembers = await this.facts.listRoomMembers({ companyId: dto.companyId, roomId: dto.roomId });
          addMeta('collaboration.members.list', true, Date.now() - t0);
          const agentIds = roomMembers
            .filter((m: any) => String(m?.memberType ?? '') === 'agent')
            .map((m: any) => String(m?.memberId ?? '').trim())
            .filter(Boolean);
          const humanIds = roomMembers
            .filter((m: any) => String(m?.memberType ?? '') === 'human')
            .map((m: any) => String(m?.memberId ?? '').trim())
            .filter(Boolean);

          const [agents, users] = await Promise.all([
            agentIds.length
              ? this.agentsRepo.find({
                  where: { companyId: dto.companyId, id: In(agentIds) } as any,
                  
                  select: ['id', 'name', 'role'],
                  take: 500,
                })
              : Promise.resolve([]),
            humanIds.length
              ? this.usersRepo.find({
                  where: { id: In(humanIds) } as any,
                  select: ['id', 'username'],
                  take: 500,
                })
              : Promise.resolve([]),
          ]);

          const agentMap = new Map(agents.map((a) => [a.id, a]));
          const userMap = new Map(users.map((u) => [u.id, u]));
          out.roomMembers = roomMembers.map((m: any) => {
            const memberType = String(m?.memberType ?? 'unknown');
            const memberId = String(m?.memberId ?? '');
            if (memberType === 'agent') {
              const a = agentMap.get(memberId);
              return {
                memberType,
                memberId,
                displayName: a?.name ?? null,
                role: a?.role ?? null,
              };
            }
            if (memberType === 'human') {
              const u = userMap.get(memberId);
              return {
                memberType,
                memberId,
                displayName: u?.username ?? null,
                role: 'human',
              };
            }
            return { memberType, memberId };
          }) as any;
          out.counts = { ...(out.counts ?? {}), roomMembers: roomMembers.length };
          this.logger.log('foundry.facts.query.completed', {
            companyId: dto.companyId,
            roomId: dto.roomId,
            traceId: dto.traceId,
            queryType: dto.queryType,
            roomMembers: roomMembers.length,
            elapsedMs: Date.now() - startedAt,
          });
          return out;
        }

        if (dto.queryType === 'company_people') {
          const t0 = Date.now();
          const agents = await this.listActiveAgents(dto.companyId);
          addMeta('agents.active.list', true, Date.now() - t0);
          out.companyPeople = agents;
          out.counts = { ...(out.counts ?? {}), companyPeople: agents.length };
          const t1 = Date.now();
          const activeMembers = await this.countActiveCompanyMembers(dto.companyId).catch(() => null);
          addMeta('companies.membership.countActive(viaRepo)', activeMembers != null, Date.now() - t1);
          if (activeMembers != null) out.counts = { ...(out.counts ?? {}), companyActiveMembers: activeMembers };
          this.logger.log('foundry.facts.query.completed', {
            companyId: dto.companyId,
            roomId: dto.roomId ?? null,
            traceId: dto.traceId,
            queryType: dto.queryType,
            companyPeople: agents.length,
            companyActiveMembers: activeMembers,
            elapsedMs: Date.now() - startedAt,
          });
          return out;
        }

        if (dto.queryType === 'role_presence') {
          if (!dto.roomId) throw new BadRequestException('roomId is required for role_presence');
          const roleQuery = String(dto.roleQuery ?? '').trim();
          if (!roleQuery) throw new BadRequestException('roleQuery is required for role_presence');
          const [agents, roomMembers] = await Promise.all([
            this.listActiveAgents(dto.companyId),
            this.facts.listRoomMembers({ companyId: dto.companyId, roomId: dto.roomId }),
          ]);
          addMeta('agents.active.list', true);
          addMeta('collaboration.members.list', true);
          const roomAgentIdSet = new Set(
            (roomMembers as any[])
              .filter((m) => String((m as any)?.memberType ?? '') === 'agent')
              .map((m) => String((m as any)?.memberId ?? '').trim())
              .filter(Boolean),
          );

          const rq = roleQuery.toLowerCase();
          const matched = agents.filter((a) => {
            const name = String(a.name ?? '').toLowerCase();
            const role = String(a.role ?? '').toLowerCase();
            return name.includes(rq) || role.includes(rq);
          });
          out.roleMatches = matched.slice(0, 12).map((a) => ({
            agentId: a.id,
            displayName: String(a.name ?? a.role ?? a.id),
            inRoom: roomAgentIdSet.has(a.id),
            matchedBy: 'substring',
          }));
          out.counts = {
            ...(out.counts ?? {}),
            roleMatches: out.roleMatches.length,
            roomAgents: roomAgentIdSet.size,
          };
          this.logger.log('foundry.facts.query.completed', {
            companyId: dto.companyId,
            roomId: dto.roomId ?? null,
            traceId: dto.traceId,
            queryType: dto.queryType,
            roleMatches: out.roleMatches.length,
            roomAgents: roomAgentIdSet.size,
            elapsedMs: Date.now() - startedAt,
          });
          return out;
        }

        if (dto.queryType === 'org_structure') {
          const t0 = Date.now();
          const tree = await this.org.getTree({});
          addMeta('organization.getTree', true, Date.now() - t0);
          out.orgStructure = { tree };
          out.counts = { ...(out.counts ?? {}), orgNodes: Array.isArray(tree) ? tree.length : 0 };
          this.logger.log('foundry.facts.query.completed', {
            companyId: dto.companyId,
            roomId: dto.roomId ?? null,
            traceId: dto.traceId,
            queryType: dto.queryType,
            orgNodes: Array.isArray(tree) ? tree.length : 0,
            elapsedMs: Date.now() - startedAt,
          });
          return out;
        }

        if (dto.queryType === 'department_roster' || dto.queryType === 'node_roster') {
          const requesterAgentId = String(dto.requester?.agentId ?? '').trim();
          if (!requesterAgentId) {
            throw new BadRequestException('requester.agentId is required for roster queries');
          }
          let anchorNodeId = String(dto.organizationNodeId ?? '').trim();
          if (dto.queryType === 'department_roster') {
            if (!anchorNodeId) {
              const anchor = await this.orgRoster.resolveDepartmentAnchorForAgent(requesterAgentId);
              if (!anchor) {
                throw new BadRequestException('requester has no department organization anchor');
              }
              anchorNodeId = anchor.organizationNodeId;
            } else {
              await this.orgRoster.assertNodeRosterAccess({
                requesterRole: dto.requester.role,
                requesterAgentId,
                targetNodeId: anchorNodeId,
              });
            }
          } else {
            if (!anchorNodeId) {
              throw new BadRequestException('organizationNodeId is required for node_roster');
            }
            await this.orgRoster.assertNodeRosterAccess({
              requesterRole: dto.requester.role,
              requesterAgentId,
              targetNodeId: anchorNodeId,
            });
          }

          const roomAgentIds: string[] = [];
          if (dto.roomId) {
            const tRm = Date.now();
            const roomMembers = await this.facts.listRoomMembers({
              companyId: dto.companyId,
              roomId: dto.roomId,
            });
            addMeta('collaboration.members.list', true, Date.now() - tRm);
            for (const m of roomMembers as Array<{ memberType?: string; memberId?: string }>) {
              if (String(m?.memberType ?? '') === 'agent') {
                const id = String(m?.memberId ?? '').trim();
                if (id) roomAgentIds.push(id);
              }
            }
          }

          const tRoster = Date.now();
          const pack = await this.orgRoster.buildDepartmentRoster({
            anchorOrganizationNodeId: anchorNodeId,
            roomAgentIds,
            scope: dto.queryType === 'node_roster' ? 'node' : 'department',
          });
          addMeta('orgRoster.buildDepartmentRoster', true, Date.now() - tRoster);
          out.departmentRoster = pack;
          for (const m of pack.sourceMeta ?? []) {
            sourceMeta.push(m);
          }
          out.counts = {
            ...(out.counts ?? {}),
            rosterTotal: pack.counts.total,
            rosterEmployees: pack.counts.employees,
            rosterInRoom: pack.counts.inCurrentRoom,
            rosterSyncDrift: pack.counts.syncDriftAgentsTableOnly,
          };
          this.logger.log('foundry.facts.query.completed', {
            companyId: dto.companyId,
            roomId: dto.roomId ?? null,
            traceId: dto.traceId,
            queryType: dto.queryType,
            anchorNodeId,
            rosterTotal: pack.counts.total,
            rosterSyncDrift: pack.counts.syncDriftAgentsTableOnly,
            elapsedMs: Date.now() - startedAt,
          });
          return out;
        }

        addMeta('facts.query', false, Date.now() - startedAt, 'unknown queryType');
        return out;
      });
    } catch (e: any) {
      this.logger.error('foundry.facts.query.failed', {
        error: e?.message ?? String(e),
      });
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('memory.query.scoped')
  async memoryQueryScoped(@Payload() payload: unknown): Promise<MemoryQueryResult> {
    try {
      const dto = validateRpcDto(MemoryQueryScopedRpcDto, payload);
      this.assertActorAdmin(dto.actor);

      return await this.runWithCompany(dto.companyId, async () => {
        const startedAt = Date.now();
        const sourceMeta: Array<{ source: string; ok: boolean; latencyMs?: number; note?: string | null }> = [];
        const namespacesAllowed = (dto.namespacesAllowed ?? [])
          .map((s) => String(s ?? '').trim())
          .filter(Boolean)
          .slice(0, 24);
        if (namespacesAllowed.length === 0) {
          throw new ForbiddenException('No allowed namespaces');
        }

        // NOTE: strict enforcement: search is constrained to namespacesAllowed; caller cannot override.
        const hits = await this.memoryRetriever.search(
          dto.query,
          {
            companyId: dto.companyId,
            actor: dto.actor as any,
            namespaces: namespacesAllowed,
            topK: Math.max(1, Math.min(24, dto.topK ?? 6)),
            minScore: 0,
            ...(dto.roomId ? { roomId: dto.roomId } : {}),
          },
          { audit: { strategy: 'search', scope: 'personal' } },
        );
        sourceMeta.push({ source: 'memory.search(scoped)', ok: true, latencyMs: Date.now() - startedAt });
        return {
          generatedAt: new Date().toISOString(),
          hits: (hits ?? []).map((h: any) => ({
            id: String(h.id),
            content: String(h.content ?? ''),
            score: Number(h.score ?? 0),
            namespace: h.namespace,
            sourceType: h.sourceType,
            metadata: h.metadata ?? null,
          })),
          sourceMeta,
        };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException ? e : new RpcException({ status: 500, message: e?.message ?? 'Internal error' });
  }
}

