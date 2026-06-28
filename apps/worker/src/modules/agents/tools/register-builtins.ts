import type { ToolRegistry } from '@service/ai';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

export interface RegisterBuiltinOptions {
  /** 默认 false：禁止无沙箱的 file-read / code-run 占位实现 */
  allowUnsafeStubs?: boolean;
  /** Optional API RPC client for builtin handlers needing internal services. */
  apiRpc?: ClientProxy;
  /** Optional RPC timeout (ms) for builtin handlers. */
  apiRpcTimeoutMs?: number;
}

function rpcTimeoutMs(opts: RegisterBuiltinOptions | undefined): number {
  return Math.max(1000, Math.min(opts?.apiRpcTimeoutMs ?? 15000, 30000));
}

function actorFromCtx(ctx: { agentId: string; roles?: string[] }) {
  return { id: ctx.agentId, roles: ctx.roles ?? ['admin'] };
}

export function registerBuiltinSkillHandlers(
  registry: ToolRegistry,
  opts?: RegisterBuiltinOptions,
): void {
  registry.registerBuiltin('echo', async (args) => ({
    ok: true,
    echoed: args.message ?? args,
  }));

  if (opts?.allowUnsafeStubs) {
    registry.registerBuiltin('file-read', async (args) => ({
      ok: true,
      path: args.path,
      content: '[stub: file read not implemented]',
    }));
    /** `code-run` 不得注册 builtin：必须由 AgentExecutionService → RunnerExecutionClient → runner.skill.execute（P8/P10） */
  }

  if (opts?.apiRpc) {
    const apiRpc = opts.apiRpc;

    registry.registerBuiltin('memory_search', async (args, ctx) => {
      const query =
        typeof args.query === 'string'
          ? args.query.trim()
          : typeof args.keyword === 'string'
            ? args.keyword.trim()
            : '';
      if (!query) {
        throw new Error('memory_search requires args.query (or args.keyword)');
      }
      const topKRaw = typeof args.topK === 'number' ? args.topK : Number(args.topK ?? 8);
      const topK = Number.isFinite(topKRaw) ? Math.max(1, Math.min(50, Math.floor(topKRaw))) : 8;
      const actor = actorFromCtx(ctx);
      const data: Record<string, unknown> = {
        query,
        topK,
      };
      if (typeof args.scope === 'string' && args.scope.trim()) data.scope = args.scope.trim();
      if (typeof args.roomId === 'string' && args.roomId.trim()) data.roomId = args.roomId.trim();
      if (typeof args.minScore === 'number' && Number.isFinite(args.minScore)) {
        data.minScore = Math.max(0, Math.min(1, Number(args.minScore)));
      }
      if (typeof args.explain === 'boolean') data.explain = args.explain;
      if (args.metadataContains && typeof args.metadataContains === 'object' && !Array.isArray(args.metadataContains)) {
        data.metadataContains = args.metadataContains as Record<string, unknown>;
      }
      const out = await firstValueFrom(
        apiRpc
          .send('memory.search.routed', {
            companyId: ctx.companyId,
            actor,
            data,
          })
          .pipe(timeout(rpcTimeoutMs(opts))),
      );
      return out;
    });

    registry.registerBuiltin('scheduled_playbooks_list', async (args, ctx) => {
      const query: Record<string, unknown> = {};
      if (typeof args.enabled === 'boolean') query.enabled = args.enabled;
      if (typeof args.page === 'number' && Number.isFinite(args.page)) query.page = Math.floor(args.page);
      if (typeof args.pageSize === 'number' && Number.isFinite(args.pageSize)) {
        query.pageSize = Math.floor(args.pageSize);
      }
      return firstValueFrom(
        apiRpc
          .send('scheduledPlaybooks.list', {
            companyId: ctx.companyId,
            actor: actorFromCtx(ctx),
            query,
          })
          .pipe(timeout(rpcTimeoutMs(opts))),
      );
    });

    registry.registerBuiltin('scheduled_playbooks_create', async (args, ctx) => {
      const data = { ...(args as Record<string, unknown>) };
      data.createdByAgentId = ctx.agentId;
      if (typeof args.chatMessageId === 'string' && args.chatMessageId.trim()) {
        data.chatMessageId = args.chatMessageId.trim();
      }
      return firstValueFrom(
        apiRpc
          .send('scheduledPlaybooks.createFromAgent', {
            companyId: ctx.companyId,
            actor: actorFromCtx(ctx),
            data,
          })
          .pipe(timeout(rpcTimeoutMs(opts))),
      );
    });

    registry.registerBuiltin('scheduled_playbooks_update', async (args, ctx) => {
      const scheduleId =
        typeof args.scheduleId === 'string'
          ? args.scheduleId.trim()
          : typeof args.id === 'string'
            ? args.id.trim()
            : '';
      if (!scheduleId) {
        throw new Error('scheduled_playbooks_update requires args.scheduleId (or args.id)');
      }
      const data = { ...(args as Record<string, unknown>) };
      delete data.scheduleId;
      delete data.id;
      return firstValueFrom(
        apiRpc
          .send('scheduledPlaybooks.updateFromAgent', {
            companyId: ctx.companyId,
            actor: actorFromCtx(ctx),
            scheduleId,
            data,
          })
          .pipe(timeout(rpcTimeoutMs(opts))),
      );
    });

    registry.registerBuiltin('scheduled_playbooks_delete', async (args, ctx) => {
      const scheduleId =
        typeof args.scheduleId === 'string'
          ? args.scheduleId.trim()
          : typeof args.id === 'string'
            ? args.id.trim()
            : '';
      if (!scheduleId) {
        throw new Error('scheduled_playbooks_delete requires args.scheduleId (or args.id)');
      }
      return firstValueFrom(
        apiRpc
          .send('scheduledPlaybooks.removeFromAgent', {
            companyId: ctx.companyId,
            actor: actorFromCtx(ctx),
            scheduleId,
          })
          .pipe(timeout(rpcTimeoutMs(opts))),
      );
    });
  }
}
