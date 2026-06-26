import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { serializeUnknownErrorForLog } from '../../../common/logging/serialize-unknown-error.js';

export type AgentDirectorySlice = {
  id: string;
  name?: string;
  role?: string;
  /** 组织节点（部门）；用于主群召唤按 slug → 部门解析 agent */
  organizationNodeId?: string;
  /** 与 API Agent 实体一致；用于房内目录中文/职责对齐，体积由上游截断。 */
  expertise?: string;
};

export type GetActiveAgentsOptions = {
  /** 仅在走网络降级 / 重试路径时回调，供 RoomContext 等打「fallback to direct rpc」类日志 */
  onFallbackDirectRpc?: (reason: string) => void;
};

const REDIS_KEY_PREFIX = 'foundry:v1:agents:active_directory:';
const REDIS_TTL_MS = 25_000;
const MEM_TTL_MS = 12_000;

/** 从 Nest RpcException / 网关错误体中提取 class-validator errors 便于排障 */
function extractValidationDiagnostics(error: unknown): { validationErrors?: unknown; rpcStatus?: unknown } {
  const out: { validationErrors?: unknown; rpcStatus?: unknown } = {};
  const take = (o: Record<string, unknown>) => {
    if (Array.isArray(o['errors'])) out.validationErrors = o['errors'];
    if (typeof o['status'] === 'number' || typeof o['status'] === 'string') out.rpcStatus = o['status'];
  };
  if (error && typeof error === 'object') {
    take(error as Record<string, unknown>);
    const err = (error as Record<string, unknown>)['error'];
    if (err && typeof err === 'object') take(err as Record<string, unknown>);
  }
  return out;
}

function formatUnknownError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const inner = o['error'];
    if (inner && typeof inner === 'object' && inner !== null && 'message' in (inner as object)) {
      return { message: String((inner as { message?: unknown }).message ?? JSON.stringify(error)) };
    }
    if (typeof o['message'] === 'string') return { message: o['message'] };
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }
  return { message: String(error) };
}

/**
 * 公司维度活跃 Agent 目录（agents.findAll 切片）进程内 + Redis 短 TTL 缓存，
 * 供 RoomContext / GroupChat / L1 PreContext 热路径复用，压低 API agents.* RPC 次数。
 */
@Injectable()
export class AgentsActiveDirectoryCacheService {
  private static loggedFindAllRawResponseOnce = false;

  private readonly logger = new Logger(AgentsActiveDirectoryCacheService.name);
  private readonly mem = new Map<string, { exp: number; items: AgentDirectorySlice[] }>();
  private readonly meter = metrics.getMeter('foundry.agents.cache');
  private readonly cacheHitCounter = this.meter.createCounter('foundry.agents.cache.hit', {
    description: 'Agents active directory cache hits (memory or redis)',
  });
  private readonly cacheMissCounter = this.meter.createCounter('foundry.agents.cache.miss', {
    description: 'Agents active directory cache misses requiring network fetch',
  });
  private readonly cacheErrorCounter = this.meter.createCounter('foundry.agents.cache.error', {
    description: 'Agents active directory cache or findAll errors',
  });

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private redisKey(companyId: string): string {
    return `${REDIS_KEY_PREFIX}${companyId}`;
  }

  private pruneMem(): void {
    if (this.mem.size > 256) {
      const now = Date.now();
      for (const [k, v] of this.mem.entries()) {
        if (v.exp <= now) this.mem.delete(k);
      }
    }
  }

  private normalizeItems(res: {
    items?: Array<{
      id?: string;
      name?: string;
      role?: string;
      organizationNodeId?: string;
      expertise?: string | null;
    }>;
  }): AgentDirectorySlice[] {
    return (res.items ?? [])
      .map((a) => ({
        id: String(a?.id ?? '').trim(),
        name: String(a?.name ?? '').trim() || undefined,
        role: String(a?.role ?? '').trim() || undefined,
        organizationNodeId: a?.organizationNodeId
          ? String(a.organizationNodeId).trim() || undefined
          : undefined,
        expertise: a?.expertise ? String(a.expertise).trim() || undefined : undefined,
      }))
      .filter((a) => Boolean(a.id));
  }

  private setMem(companyId: string, items: AgentDirectorySlice[]): void {
    this.mem.set(companyId, { exp: Date.now() + MEM_TTL_MS, items });
  }

  /** Redis 失败时仅依赖进程 Map，不抛错。 */
  private async safeRedisSet(key: string, value: string): Promise<void> {
    try {
      await this.redis.setPx(key, value, REDIS_TTL_MS);
    } catch (error: unknown) {
      this.cacheErrorCounter.add(1, { where: 'redis_set' });
      const f = formatUnknownError(error);
      this.logger.warn('agents_active_directory.redis_set_failed', {
        key,
        error: f.message,
        stack: f.stack,
        fullError: serializeUnknownErrorForLog(error),
      });
    }
  }

  /** 单次 agents.findAll；失败时抛错由调用方决定是否重试。 */
  private async fetchFindAllOnce(
    companyId: string,
    actor: { id: string; roles: string[] },
  ): Promise<{ items: AgentDirectorySlice[] }> {
    const pageSize = this.config.getAgentsActiveDirectoryPageSize();
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ id?: string; name?: string; role?: string }> }>('agents.findAll', {
          companyId,
          actor,
          status: 'active',
          page: 1,
          pageSize,
        })
        .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
    if (!AgentsActiveDirectoryCacheService.loggedFindAllRawResponseOnce) {
      AgentsActiveDirectoryCacheService.loggedFindAllRawResponseOnce = true;
      const bodyEnabled = ['1', 'true', 'yes'].includes(
        String(process.env.FOUNDRY_LOG_AGENTS_FINDALL_BODY ?? '').trim().toLowerCase(),
      );
      const rawItems = Array.isArray((res as { items?: unknown }).items)
        ? ((res as { items: unknown[] }).items ?? [])
        : [];
      const sampleAgentIds = rawItems
        .slice(0, 6)
        .map((a) => String((a as { id?: string })?.id ?? '').trim())
        .filter(Boolean);

      if (bodyEnabled) {
        let responseJson = '';
        try {
          responseJson = JSON.stringify(res);
        } catch (stringifyErr: unknown) {
          responseJson = `[JSON.stringify_failed: ${formatUnknownError(stringifyErr).message}]`;
        }
        const maxChars = Math.max(
          10_000,
          Math.min(
            2_000_000,
            Number.parseInt(String(process.env.FOUNDRY_LOG_AGENTS_FINDALL_MAX_CHARS ?? '400000'), 10) || 400_000,
          ),
        );
        const truncated = responseJson.length > maxChars;
        this.logger.log('agents_active_directory.find_all_raw_response_once', {
          companyId,
          topLevelKeys: res && typeof res === 'object' ? Object.keys(res as object) : [],
          responseCharLength: responseJson.length,
          truncated,
          maxChars,
          responseJson: truncated
            ? `${responseJson.slice(0, maxChars)}\n/* …truncated per FOUNDRY_LOG_AGENTS_FINDALL_MAX_CHARS */`
            : responseJson,
        });
      } else {
        this.logger.log('agents_active_directory.find_all_snapshot_once', {
          companyId,
          topLevelKeys: res && typeof res === 'object' ? Object.keys(res as object) : [],
          itemCount: rawItems.length,
          sampleAgentIds,
          hint: 'set FOUNDRY_LOG_AGENTS_FINDALL_BODY=true for full JSON (avoid systemPrompt in prod)',
        });
      }
    }
    return { items: this.normalizeItems(res) };
  }

  private logFindAllFailure(companyId: string, attempt: number, error: unknown): void {
    const f = formatUnknownError(error);
    const vd = extractValidationDiagnostics(error);
    this.logger.warn('agents_active_directory.find_all_failed', {
      companyId,
      attempt,
      pageSizeRequested: this.config.getAgentsActiveDirectoryPageSize(),
      error: f.message,
      stack: f.stack,
      validationErrors: vd.validationErrors,
      rpcStatus: vd.rpcStatus,
      fullError: serializeUnknownErrorForLog(error),
    });
  }

  /**
   * 最多 2 次网络 findAll：仅在首次 **抛错** 时重试一次；空列表视为合法结果不重试。
   * 避免把验收「单路径 1 次 RPC」压成无意义双请求。
   */
  private async fetchFindAllWithOptionalRetry(
    companyId: string,
    actor: { id: string; roles: string[] },
    opts?: GetActiveAgentsOptions,
  ): Promise<AgentDirectorySlice[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { items } = await this.fetchFindAllOnce(companyId, actor);
        if (attempt === 1) {
          opts?.onFallbackDirectRpc?.('find_all_succeeded_after_retry');
        }
        return items;
      } catch (error: unknown) {
        this.logFindAllFailure(companyId, attempt, error);
        this.cacheErrorCounter.add(1, { where: attempt === 0 ? 'find_all_primary' : 'find_all_retry' });
        if (attempt === 0) {
          opts?.onFallbackDirectRpc?.('find_all_retrying_direct_rpc');
        } else {
          opts?.onFallbackDirectRpc?.('find_all_exhausted_empty');
          return [];
        }
      }
    }
    return [];
  }

  async getActiveAgents(
    companyId: string,
    actor: { id: string; roles: string[] },
    opts?: GetActiveAgentsOptions,
  ): Promise<AgentDirectorySlice[]> {
    const cid = String(companyId ?? '').trim();
    if (!cid) return [];
    this.pruneMem();

    const memRow = this.mem.get(cid);
    if (memRow && memRow.exp > Date.now()) {
      this.cacheHitCounter.add(1, { tier: 'memory' });
      return memRow.items;
    }

    const rk = this.redisKey(cid);
    let raw: string | null = null;
    try {
      raw = await this.redis.get(rk);
    } catch (error: unknown) {
      this.cacheErrorCounter.add(1, { where: 'redis_get' });
      const f = formatUnknownError(error);
      this.logger.warn('agents_active_directory.redis_get_failed', {
        companyId: cid,
        error: f.message,
        stack: f.stack,
        fullError: serializeUnknownErrorForLog(error),
      });
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const items = parsed
            .map((a) => {
              const o = a as {
                id?: string;
                name?: string;
                role?: string;
                organizationNodeId?: string;
                expertise?: string;
              };
              return {
                id: String(o?.id ?? '').trim(),
                name: String(o?.name ?? '').trim() || undefined,
                role: String(o?.role ?? '').trim() || undefined,
                organizationNodeId: o?.organizationNodeId
                  ? String(o.organizationNodeId).trim() || undefined
                  : undefined,
                expertise: o?.expertise ? String(o.expertise).trim() || undefined : undefined,
              };
            })
            .filter((a) => Boolean(a.id));
          this.setMem(cid, items);
          this.cacheHitCounter.add(1, { tier: 'redis' });
          return items;
        }
      } catch (error: unknown) {
        this.cacheErrorCounter.add(1, { where: 'redis_json_parse' });
        const f = formatUnknownError(error);
        this.logger.warn('agents_active_directory.redis_corrupt_payload', {
          companyId: cid,
          error: f.message,
          fullError: serializeUnknownErrorForLog(error),
        });
      }
    }

    this.cacheMissCounter.add(1, { reason: 'network_fetch' });
    const items = await this.fetchFindAllWithOptionalRetry(cid, actor, opts);
    this.setMem(cid, items);
    await this.safeRedisSet(rk, JSON.stringify(items));
    return items;
  }
}
