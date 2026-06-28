import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { readCollabSessionWithThreadFallback } from '@contracts/types';

/**
 * 从 Collab Redis 读取 JSON 会话，支持 threadId → main 回退（可 strict 关闭回退）。
 */
export async function readCollabRedisJsonSession<T>(params: {
  collabRedis: CollabRedisCacheService;
  redisKey: (normalizedThreadId: string) => string;
  threadId?: string | null;
  strictThreadIsolation?: boolean;
  parse: (raw: string) => T | null;
}): Promise<{
  session: T | null;
  resolvedThreadId: string;
  resolvedVia: 'thread' | 'main_fallback' | 'none';
}> {
  const { value, resolvedThreadId, resolvedVia } = await readCollabSessionWithThreadFallback({
    threadId: params.threadId,
    strictThreadIsolation: params.strictThreadIsolation,
    read: async (tid) => {
      const raw = await params.collabRedis.get(params.redisKey(tid));
      if (raw == null) return null;
      return params.parse(raw);
    },
  });
  return { session: value, resolvedThreadId, resolvedVia };
}
