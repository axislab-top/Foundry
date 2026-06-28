import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { LlmKeyResolverService } from '../../autonomous/llm-key-resolver.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import type { RoomContext, RoomMemberDirectoryEntry, RoomType } from '../contracts/collaboration-2026.contracts.js';
import { AgentsActiveDirectoryCacheService, type GetActiveAgentsOptions } from './agents-active-directory-cache.service.js';
import {
  normalizeRoomCollaborationMode,
  readCollaborationModeFromRoomPayload,
} from './room-context-collaboration-mode.util.js';

type ChatRoomLite = {
  id: string;
  roomType?: string;
  name?: string;
  organizationNodeId?: string | null;
  metadata?: Record<string, unknown> | null;
  collaborationMode?: string | null;
  /** 少数序列化路径可能落库列名形态；缺失时勿静默当成 discussion */
  collaboration_mode?: string | null;
};

type RoomMemberLite = {
  memberType?: string;
  memberId?: string;
};

type RoomOrgSnapshotRpc = {
  departments: Array<{
    id: string;
    name: string;
    slug: string;
    platformDepartmentSlug?: string | null;
    responsibilitySummary?: string;
    taskTypeTags?: string[];
    excludesTaskTypeTags?: string[];
    capabilitiesSource?: string;
  }>;
  updatedAt: string;
};

/**
 * 2026 主群：将结构化成员目录序列化为 Intent/Memory/Orchestration 共用 prompt 切片。
 */
/** 主群编排：把组织快照部门列表做成权威事实块，避免 CEO 臆造「公司有哪些部门」。 */
export function buildOrgSnapshotPromptBlock(
  departments: Array<{
    id: string;
    name: string;
    slug: string;
    responsibilitySummary?: string;
    taskTypeTags?: string[];
  }>,
): string {
  if (!Array.isArray(departments) || departments.length === 0) return '';
  const lines = departments.map((d, idx) => {
    const name = String(d.name ?? '').trim() || '未命名部门';
    const slug = String(d.slug ?? '').trim() || '—';
    const summary = String(d.responsibilitySummary ?? '').trim();
    const tags = Array.isArray(d.taskTypeTags) ? d.taskTypeTags.join(', ') : '';
    const capSeg = summary ? ` — 职能: ${summary.slice(0, 120)}` : '';
    const tagSeg = tags ? ` — tags: ${tags}` : '';
    return `${idx + 1}. ${name}（slug: ${slug}${capSeg}${tagSeg}）`;
  });
  return [
    '【organization.org_snapshot — authoritative】',
    '以下为当前公司在组织节点中登记的部门（仅列事实；若用户问「有哪些部门」须据此枚举，勿编造未列名称）：',
    ...lines,
  ].join('\n');
}

function truncateRoutingSnippet(s: string | undefined, maxChars: number): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}

export function buildRoomMemberPromptBlock(directory: RoomMemberDirectoryEntry[]): string {
  if (!Array.isArray(directory) || directory.length === 0) {
    return '【room_member_directory】当前房间暂无活跃成员记录（或尚未解析到展示名）。';
  }
  const lines = directory.map((m, idx) => {
    const kind = m.memberType === 'agent' ? 'Agent' : 'Human';
    const name = (m.displayName ?? '').trim() || m.memberId;
    const role = (m.roleLabel ?? '').trim() || 'n/a';
    if (m.memberType === 'agent') {
      const dept = (m.departmentDisplayName ?? '').trim();
      const exp = truncateRoutingSnippet(m.expertiseSnippet, 200);
      const deptSeg = dept ? ` — dept:${dept}` : '';
      const expSeg = exp ? ` — scope:${exp}` : '';
      return `${idx + 1}. [${kind}] ${name} — role:${role}${deptSeg}${expSeg} — id:${m.memberId}`;
    }
    return `${idx + 1}. [${kind}] ${name} — role:${role} — id:${m.memberId}`;
  });
  return `【room_member_directory 2026 — authoritative for “谁在群里 / 公司或房间有哪些人”】\n${lines.join('\n')}`;
}

/**
 * 标明本回合 CEO 回复者对应目录中的哪一行，避免「我」与 roster 中 CEO 条分裂（如自称 owner 又单独列 CEO）。
 */
export function buildCeoSpeakerPromptLine(
  ceoAgentId: string | null | undefined,
  directory: RoomMemberDirectoryEntry[],
): string {
  const id = String(ceoAgentId ?? '').trim();
  if (!id) return '';
  const row = directory.find((m) => String(m.memberId ?? '').trim() === id);
  if (!row) {
    return `【speaker】本回复以第一人称发出；CEO agentId=${id}。房内目录未含该 id 时勿臆测「我」的职务，仅按目录列举他人。`;
  }
  const name = (row.displayName ?? '').trim() || row.memberId;
  const role = (row.roleLabel ?? '').trim() || 'n/a';
  const kind = row.memberType === 'agent' ? 'Agent' : 'Human';
  return `【speaker】第一人称「我」= 下表 id=${row.memberId} 的 ${kind}「${name}」（role=${role}）。此为内部身份锚点；可见回复勿复述成员目录，除非用户明确询问。`;
}

@Injectable()
export class RoomContextService {
  private readonly logger = new Logger(RoomContextService.name);
  private readonly roomContextCache = new Map<string, { exp: number; ctx: RoomContext }>();

  constructor(
    private readonly config: ConfigService,
    private readonly llmKeyResolver: LlmKeyResolverService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly agentsDirectoryCache: AgentsActiveDirectoryCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  async buildRoomContext(params: { companyId: string; roomId: string }): Promise<RoomContext> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) {
      throw new Error('room_context_invalid_input');
    }

    const ttlMs = this.config.getCollabOrgSnapshotRoomContextCacheTtlMs();

    const [room, members, orgRpc] = await Promise.all([
      this.rpc<ChatRoomLite>('collaboration.rooms.findOne', {
        companyId,
        actor: this.workerActor(),
        roomId,
      }),
      this.rpc<RoomMemberLite[]>('collaboration.members.list', {
        companyId,
        actor: this.workerActor(),
        roomId,
      }).catch(() => []),
      this.rpcOrgSnapshot<RoomOrgSnapshotRpc>('organization.nodes.getRoomOrgSnapshot', {
        companyId,
        actor: this.workerActor(),
        roomId,
      }),
    ]);

    const rawCollaborationMode = readCollaborationModeFromRoomPayload(room);
    if (rawCollaborationMode === undefined && room && typeof room === 'object' && String(room.id ?? '').trim() === roomId) {
      this.logger.warn('room_context.find_one_missing_collaboration_mode_field', {
        companyId,
        roomId,
        keysSample: Object.keys(room as object).slice(0, 24),
      });
    }
    const collaborationMode = normalizeRoomCollaborationMode(rawCollaborationMode);
    const cacheKey = `${companyId}|${roomId}|${collaborationMode}`;
    if (ttlMs > 0) {
      const hit = this.roomContextCache.get(cacheKey);
      if (hit && hit.exp > Date.now()) {
        this.logger.debug('room_context.cache_hit', { companyId, roomId, ttlMs, collaborationMode });
        return hit.ctx;
      }
    }

    const roomType = this.normalizeRoomType(room?.roomType);
    const normalizedMembers = (Array.isArray(members) ? members : [])
      .map((m) => {
        const memberType: 'agent' | 'human' =
          String(m?.memberType ?? '').trim() === 'agent' ? 'agent' : 'human';
        return { memberType, memberId: String(m?.memberId ?? '').trim() };
      })
      .filter((m) => Boolean(m.memberId));

    const deptRows = orgRpc.departments.map((d) => ({
      id: String(d.id),
      name: String(d.name),
      slug: String(d.slug),
      ...(d.platformDepartmentSlug != null ? { platformDepartmentSlug: d.platformDepartmentSlug } : {}),
      ...(d.responsibilitySummary ? { responsibilitySummary: d.responsibilitySummary } : {}),
      ...(Array.isArray(d.taskTypeTags) && d.taskTypeTags.length ? { taskTypeTags: d.taskTypeTags } : {}),
      ...(Array.isArray(d.excludesTaskTypeTags) && d.excludesTaskTypeTags.length
        ? { excludesTaskTypeTags: d.excludesTaskTypeTags }
        : {}),
      ...(d.capabilitiesSource ? { capabilitiesSource: d.capabilitiesSource } : {}),
    }));
    const memberDirectory = await this.buildMemberDirectory(companyId, normalizedMembers, deptRows);

    const orgSnapshot = {
      departments: deptRows,
      updatedAt: orgRpc.updatedAt,
    };

    this.logger.log('room_context_org_snapshot_ready', {
      companyId,
      roomId,
      departmentCount: orgSnapshot.departments.length,
      memberDirectoryCount: memberDirectory.length,
    });

    void this.warmMainRoomIntentLayerKey(companyId).catch((err: unknown) => {
      this.logger.warn('room_context_llm_key_warm_failed', {
        companyId,
        err: err instanceof Error ? err.message : String(err),
      });
    });

    const built: RoomContext = {
      companyId,
      roomId,
      roomType,
      roomName: String(room?.name ?? '').trim() || 'unknown-room',
      organizationNodeId: room?.organizationNodeId ? String(room.organizationNodeId) : null,
      members: normalizedMembers,
      memberDirectory,
      orgSnapshot,
      collaborationMode,
    };
    if (ttlMs > 0) {
      this.roomContextCache.set(cacheKey, { exp: Date.now() + ttlMs, ctx: built });
    }
    return built;
  }

  /**
   * 协作模式变更（或其它需强制刷新房间快照的场景）：删除该房间下所有 `collaborationMode` 变体的缓存条目。
   * 键格式为 `{companyId}|{roomId}|{normalizedMode}`；失效后下一次 build 会重新 RPC。
   */
  invalidateCachesForRoom(companyId: string, roomId: string): void {
    const c = String(companyId ?? '').trim();
    const r = String(roomId ?? '').trim();
    if (!c || !r) return;
    const prefix = `${c}|${r}|`;
    let removed = 0;
    for (const key of this.roomContextCache.keys()) {
      if (key.startsWith(prefix)) {
        this.roomContextCache.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.debug('room_context.cache_invalidated_room', { companyId: c, roomId: r, removed });
    }
  }

  /**
   * 解析成员展示名与人类租户角色；Agent 侧从 agents.findAll 切片 + findOne 缺口补全，
   * 并挂载部门展示名与 expertise 摘要，供 Intent/召唤与 LLM 中英职务对齐。
   */
  private async buildMemberDirectory(
    companyId: string,
    members: Array<{ memberType: 'human' | 'agent'; memberId: string }>,
    departments: Array<{ id: string; name: string; slug: string }>,
  ): Promise<RoomMemberDirectoryEntry[]> {
    const agentIds = members.filter((m) => m.memberType === 'agent').map((m) => m.memberId);
    const humanIds = members.filter((m) => m.memberType === 'human').map((m) => m.memberId);
    const deptNameById = new Map<string, string>();
    for (const d of departments) {
      const id = String(d.id ?? '').trim();
      if (!id) continue;
      deptNameById.set(id, String(d.name ?? '').trim() || id);
    }

    type AgentRoutingMeta = {
      displayName: string;
      roleLabel: string;
      organizationNodeId?: string | null;
      expertise?: string | null;
    };
    const agentMeta = new Map<string, AgentRoutingMeta>();
    if (agentIds.length) {
      const cacheOpts: GetActiveAgentsOptions = {
        onFallbackDirectRpc: (reason) => {
          this.logger.warn('room_context_agent_directory_fallback_to_direct_rpc', {
            companyId,
            reason,
          });
        },
      };
      const roster = await this.agentsDirectoryCache.getActiveAgents(companyId, this.workerActor(), cacheOpts);
      const idSet = new Set(agentIds);
      for (const a of roster) {
        const id = String(a.id).trim();
        if (!id || !idSet.has(id)) continue;
        const exp = a.expertise ? String(a.expertise).trim() : '';
        agentMeta.set(id, {
          displayName: (a.name ?? '').trim() || id,
          roleLabel: (a.role ?? '').trim() || 'agent',
          organizationNodeId: a.organizationNodeId ? String(a.organizationNodeId).trim() : null,
          expertise: exp || null,
        });
      }
      /** 目录缓存仅为 findAll 第一页切片；房内成员可能不在切片中，必须按 id 拉平否则 Intent 侧只见 UUID。 */
      const missingFromSlice = agentIds.filter((id) => !agentMeta.has(id));
      if (missingFromSlice.length) {
        this.logger.log('room_context_agent_directory_hydrate_missing_from_slice', {
          companyId,
          missingCount: missingFromSlice.length,
        });
        await this.hydrateAgentMetaByFindOne(companyId, missingFromSlice, agentMeta);
      }
    }
    const humanMeta = new Map<string, { displayName: string; roleLabel: string }>();
    await Promise.all(
      humanIds.map(async (uid) => {
        let displayName = uid;
        let roleLabel = 'member';
        try {
          const u = await this.rpc<{ username?: string; email?: string }>('users.findOne', {
            id: uid,
            companyId,
            actor: this.workerActor(),
          });
          displayName = String(u?.username ?? u?.email ?? uid).trim() || uid;
        } catch {
          /* non-fatal */
        }
        try {
          const m = await this.rpc<{ role?: string } | null>('companies.membership.findActive', {
            companyId,
            userId: uid,
            actor: this.workerActor(),
          });
          if (m && typeof m.role === 'string' && m.role.trim()) roleLabel = m.role.trim();
        } catch {
          /* non-fatal */
        }
        humanMeta.set(uid, { displayName, roleLabel });
      }),
    );

    return members.map((m) => {
      if (m.memberType === 'agent') {
        const meta = agentMeta.get(m.memberId);
        const orgId = meta?.organizationNodeId ? String(meta.organizationNodeId).trim() : '';
        const deptName = orgId ? deptNameById.get(orgId) : undefined;
        const expertiseRaw = meta?.expertise ? String(meta.expertise).trim() : '';
        const expertiseSnippet = expertiseRaw
          ? expertiseRaw.length > 360
            ? `${expertiseRaw.slice(0, 360)}…`
            : expertiseRaw
          : undefined;
        return {
          memberType: 'agent' as const,
          memberId: m.memberId,
          displayName: meta?.displayName ?? m.memberId,
          roleLabel: meta?.roleLabel ?? 'agent',
          organizationNodeId: orgId || null,
          ...(deptName ? { departmentDisplayName: deptName } : {}),
          ...(expertiseSnippet ? { expertiseSnippet } : {}),
        };
      }
      const meta = humanMeta.get(m.memberId);
      return {
        memberType: 'human' as const,
        memberId: m.memberId,
        displayName: meta?.displayName ?? m.memberId,
        roleLabel: meta?.roleLabel ?? 'member',
      };
    });
  }

  /** 与 Admin `contextPolicy.intentLayer` / 层解析器对齐，预热 Intent 实际 chat 模型密钥。 */
  private async warmMainRoomIntentLayerKey(companyId: string): Promise<void> {
    const setting = await this.ceoLayerConfigResolver.resolveLayerSetting(companyId, 'intent');
    const model = String(setting.modelName ?? '').trim();
    if (!model) return;
    await this.llmKeyResolver.warmLlmKeyAcquireForCompanyModel(companyId, model);
  }

  /**
   * 对未出现在 agents.findAll 第一页缓存中的房内 agent，逐 id 调用 agents.findOne 补全展示名/职务/组织节点/expertise。
   * 控制并发，避免主群大房间时 burst RPC。
   */
  private async hydrateAgentMetaByFindOne(
    companyId: string,
    agentIds: string[],
    into: Map<
      string,
      {
        displayName: string;
        roleLabel: string;
        organizationNodeId?: string | null;
        expertise?: string | null;
      }
    >,
  ): Promise<void> {
    const concurrency = 6;
    const actor = this.workerActor();
    for (let i = 0; i < agentIds.length; i += concurrency) {
      const chunk = agentIds.slice(i, i + concurrency);
      const rows = await Promise.all(
        chunk.map(async (rawId) => {
          const id = String(rawId ?? '').trim();
          if (!id)
            return {
              id: '',
              meta: null as {
                displayName: string;
                roleLabel: string;
                organizationNodeId?: string | null;
                expertise?: string | null;
              } | null,
            };
          try {
            const a = await this.rpc<{
              name?: string;
              role?: string;
              organizationNodeId?: string | null;
              expertise?: string | null;
            }>('agents.findOne', {
              companyId,
              actor,
              id,
            });
            const exp = a?.expertise != null ? String(a.expertise).trim() : '';
            return {
              id,
              meta: {
                displayName: (a?.name ?? '').trim() || id,
                roleLabel: (a?.role ?? '').trim() || 'agent',
                organizationNodeId: a?.organizationNodeId ? String(a.organizationNodeId).trim() : null,
                expertise: exp || null,
              },
            };
          } catch (err: unknown) {
            this.logger.warn('room_context_agent_find_one_failed', {
              companyId,
              agentId: id,
              err: err instanceof Error ? err.message : String(err),
            });
            return { id, meta: null };
          }
        }),
      );
      for (const { id, meta } of rows) {
        if (id && meta) into.set(id, meta);
      }
    }
  }

  private normalizeRoomType(value: unknown): RoomType {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'main' || raw === 'department' || raw === 'task' || raw === 'custom' || raw === 'direct') {
      return raw;
    }
    return 'custom';
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpcOrgSnapshot<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const ms = Math.max(this.config.getCollaborationMentionRpcTimeoutMs(), 30_000);
    return await firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(ms)));
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }
}
