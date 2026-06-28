import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import { extractEmbeddingVectorFromEmbeddingsJson } from '../../../common/llm/openai-compatible-embedding-extract.js';
import { projectEmbeddingLinearDown } from '../../../common/llm/embedding-projection.util.js';
import {
  EmbeddingResolverService,
  estimateEmbeddingInputTokens,
  parseEmbeddingUsageTokensFromJson,
} from '../../embedding-models/embedding-resolver.service.js';

export type EmbedTextContext = {
  companyId?: string;
  agentId?: string | null;
};

/**
 * 与本次向量生成对应的计费溯源；池化路径来自 {@link EmbeddingResolverService.tryEmbedFromPool}，
 * MEMORY_* 直连路径 `llmModelId` 为 null（未绑定 `llm_models` 目录价时 resolve 为 0）。
 * 确定性伪向量路径 `provenance` 为 null，且不发布 embedding 消耗事件。
 */
export type EmbedTextProvenance = {
  llmModelId: string | null;
  modelName: string;
  providerCode: string;
  inputTokens: number;
  llmKeyId?: string | null;
};

export type EmbedTextResult = {
  embedding: number[];
  provenance: EmbedTextProvenance | null;
};

type EmbedCacheEntry = {
  embedding: number[];
  provenance: EmbedTextProvenance | null;
  expiresAt: number;
};

const EMBED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EMBED_CACHE_SOFT_CAP = 1024;
const EMBED_CACHE_HARD_CAP = 2048;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embedCache = new Map<string, EmbedCacheEntry>();

  constructor(
    private readonly config: ConfigService,
    private readonly embeddingResolver: EmbeddingResolverService,
  ) {}

  get dimensions(): number {
    return this.config.getMemoryConfig().embeddingDimensions;
  }

  private pruneEmbedCache(now: number): void {
    if (this.embedCache.size <= EMBED_CACHE_SOFT_CAP) return;
    for (const [k, v] of this.embedCache.entries()) {
      if (v.expiresAt <= now) this.embedCache.delete(k);
    }
    if (this.embedCache.size > EMBED_CACHE_HARD_CAP) {
      const entries = [...this.embedCache.entries()].sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt,
      );
      const toEvict = entries.slice(0, entries.length - EMBED_CACHE_HARD_CAP);
      for (const [k] of toEvict) {
        this.embedCache.delete(k);
      }
    }
  }

  /**
   * 公司默认 embedding 模型在库中配置的维度优先，否则 MEMORY_EMBEDDING_DIMENSIONS。
   * Phase3：开启 EMBEDDING_PROJECTION_ENABLED 时固定为 EMBEDDING_TARGET_DIM（与入库 / GraphRAG 一致）。
   */
  async resolveEffectiveEmbeddingDimensions(ctx?: EmbedTextContext): Promise<number> {
    const mem = this.config.getMemoryConfig();
    if (mem.embeddingProjectionEnabled) {
      return mem.embeddingTargetDim;
    }
    if (ctx?.companyId) {
      try {
        const d = await this.embeddingResolver.resolveDefaultEmbeddingDimensions({
          companyId: ctx.companyId,
          agentId: ctx.agentId ?? undefined,
        });
        if (d != null && d > 0) return d;
      } catch {
        // 解析失败时回退全局配置
      }
    }
    return this.dimensions;
  }

  /**
   * OpenAI 兼容 Embeddings API。
   * 优先：公司级 embedding_models 池（管理员配置；可选 company override / assignment）。
   * 回退：MEMORY_* 环境变量（兼容旧部署）。
   * 无密钥：确定性伪向量（开发/测试）；无硬配额；`provenance` 为 null（不计供应商消耗事件）。
   */
  async embedText(text: string, ctx?: EmbedTextContext): Promise<EmbedTextResult> {
    const trimmed = text?.trim() ?? '';
    const expectedDim = await this.resolveEffectiveEmbeddingDimensions(ctx);
    if (!trimmed) {
      return { embedding: this.zeroVector(expectedDim), provenance: null };
    }

    // --- LRU cache check (Opt 1: avoid redundant API calls for identical text) ---
    const now = Date.now();
    this.pruneEmbedCache(now);
    const cacheKey = createHash('sha256')
      .update(`${trimmed}|${expectedDim}`)
      .digest('hex');
    const cached = this.embedCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { embedding: cached.embedding, provenance: cached.provenance };
    }

    const storeAndReturn = (result: EmbedTextResult): EmbedTextResult => {
      this.embedCache.set(cacheKey, {
        embedding: result.embedding,
        provenance: result.provenance,
        expiresAt: Date.now() + EMBED_CACHE_TTL_MS,
      });
      return result;
    };

    if (ctx?.companyId) {
      try {
        const pooled = await this.embeddingResolver.tryEmbedFromPool(
          trimmed,
          { ...ctx, companyId: ctx.companyId },
          expectedDim,
        );
        if (pooled) {
          return storeAndReturn({
            embedding: pooled.embedding,
            provenance: {
              llmModelId: pooled.provenance.llmModelId,
              modelName: pooled.provenance.modelName,
              providerCode: pooled.provenance.providerCode,
              inputTokens: pooled.provenance.inputTokens,
              llmKeyId: pooled.provenance.llmKeyId ?? null,
            },
          });
        }
      } catch (e: unknown) {
        this.logger.warn('pool embedding resolve failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const memCfgInit = this.config.getMemoryConfig();
    const { openaiApiKey, openaiBaseUrl, embeddingModel } = memCfgInit;
    if (!openaiApiKey) {
      return storeAndReturn({ embedding: this.deterministicEmbedding(trimmed, expectedDim), provenance: null });
    }
    try {
      const memCfg = memCfgInit;
      const url = `${openaiBaseUrl.replace(/\/$/, '')}/embeddings`;
      const m = String(embeddingModel ?? '').trim();
      const enc = { encoding_format: 'float' as const };
      const maxOpenAiT3 = /large/i.test(m) ? 3072 : 1536;
      const body: Record<string, unknown> = {
        model: m,
        input: trimmed.slice(0, 8000),
        ...enc,
      };
      if (/^text-embedding-3/i.test(m) && expectedDim >= 256 && expectedDim <= maxOpenAiT3) {
        body.dimensions = expectedDim;
      } else if (/^text-embedding-3/i.test(m) && expectedDim > maxOpenAiT3) {
        this.logger.warn(
          'MEMORY_EMBEDDING_DIMENSIONS 超过当前 OpenAI text-embedding-3 模型上限；请改用 -large（默认）或池化 2048 模型',
          { model: m, expectedDim, maxOpenAiT3 },
        );
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), memCfg.embeddingFetchTimeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.warn('OpenAI embeddings failed', {
          status: res.status,
          errBody: errBody.slice(0, 500),
        });
        return storeAndReturn({ embedding: this.deterministicEmbedding(trimmed, expectedDim), provenance: null });
      }
      const json = (await res.json()) as unknown;
      let emb = extractEmbeddingVectorFromEmbeddingsJson(json);
      if (
        emb &&
        memCfg.embeddingProjectionEnabled &&
        memCfg.embeddingModelOutputDim !== expectedDim &&
        emb.length === memCfg.embeddingModelOutputDim
      ) {
        emb = projectEmbeddingLinearDown(emb, memCfg.embeddingModelOutputDim, expectedDim);
      }
      if (!emb || emb.length !== expectedDim) {
        this.logger.warn('Unexpected embedding shape', {
          len: emb?.length,
          expectedDim,
        });
        return storeAndReturn({ embedding: this.deterministicEmbedding(trimmed, expectedDim), provenance: null });
      }
      const usageTok = parseEmbeddingUsageTokensFromJson(json);
      const inputTokens = usageTok ?? estimateEmbeddingInputTokens(trimmed);
      return storeAndReturn({
        embedding: emb,
        provenance: {
          llmModelId: null,
          modelName: m || 'unknown',
          providerCode: 'memory_env',
          inputTokens,
          llmKeyId: null,
        },
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        this.logger.warn('embedding fetch timed out', { timeoutMs: memCfgInit.embeddingFetchTimeoutMs });
        throw e;
      }
      this.logger.warn('embedText error', { message: e instanceof Error ? e.message : String(e) });
      return storeAndReturn({ embedding: this.deterministicEmbedding(trimmed, expectedDim), provenance: null });
    }
  }

  /**
   * Batch embed multiple texts in a single API call. Cache hits are returned
   * directly; only uncached texts are sent to the embedding API.
   */
  async embedTexts(texts: string[], ctx?: EmbedTextContext): Promise<EmbedTextResult[]> {
    if (!texts.length) return [];
    const expectedDim = await this.resolveEffectiveEmbeddingDimensions(ctx);
    const now = Date.now();
    this.pruneEmbedCache(now);

    const results: EmbedTextResult[] = new Array(texts.length);
    const missIndices: number[] = [];
    const missTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const trimmed = texts[i]?.trim() ?? '';
      if (!trimmed) {
        results[i] = { embedding: this.zeroVector(expectedDim), provenance: null };
        continue;
      }
      const cacheKey = createHash('sha256')
        .update(`${trimmed}|${expectedDim}`)
        .digest('hex');
      const cached = this.embedCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        results[i] = { embedding: cached.embedding, provenance: cached.provenance };
      } else {
        missIndices.push(i);
        missTexts.push(trimmed);
      }
    }

    if (!missTexts.length) return results;

    // Try pool first for each miss (pool doesn't support batch)
    const stillMissIndices: number[] = [];
    const stillMissTexts: string[] = [];
    if (ctx?.companyId) {
      for (let j = 0; j < missTexts.length; j++) {
        try {
          const pooled = await this.embeddingResolver.tryEmbedFromPool(
            missTexts[j],
            { ...ctx, companyId: ctx.companyId },
            expectedDim,
          );
          if (pooled) {
            const result: EmbedTextResult = {
              embedding: pooled.embedding,
              provenance: {
                llmModelId: pooled.provenance.llmModelId,
                modelName: pooled.provenance.modelName,
                providerCode: pooled.provenance.providerCode,
                inputTokens: pooled.provenance.inputTokens,
                llmKeyId: pooled.provenance.llmKeyId ?? null,
              },
            };
            results[missIndices[j]] = result;
            const ck = createHash('sha256')
              .update(`${missTexts[j]}|${expectedDim}`)
              .digest('hex');
            this.embedCache.set(ck, {
              embedding: result.embedding,
              provenance: result.provenance,
              expiresAt: Date.now() + EMBED_CACHE_TTL_MS,
            });
            continue;
          }
        } catch {
          // fall through to batch API
        }
        stillMissIndices.push(missIndices[j]);
        stillMissTexts.push(missTexts[j]);
      }
    } else {
      stillMissIndices.push(...missIndices);
      stillMissTexts.push(...missTexts);
    }

    if (!stillMissTexts.length) return results;

    // Batch API call for remaining misses
    const { openaiApiKey, openaiBaseUrl, embeddingModel } = this.config.getMemoryConfig();
    if (!openaiApiKey) {
      for (let j = 0; j < stillMissTexts.length; j++) {
        const det = this.deterministicEmbedding(stillMissTexts[j], expectedDim);
        results[stillMissIndices[j]] = { embedding: det, provenance: null };
      }
      return results;
    }

    try {
      const memCfg = this.config.getMemoryConfig();
      const url = `${openaiBaseUrl.replace(/\/$/, '')}/embeddings`;
      const m = String(embeddingModel ?? '').trim();
      const maxOpenAiT3 = /large/i.test(m) ? 3072 : 1536;
      const body: Record<string, unknown> = {
        model: m,
        input: stillMissTexts.map((t) => t.slice(0, 8000)),
        encoding_format: 'float',
      };
      if (/^text-embedding-3/i.test(m) && expectedDim >= 256 && expectedDim <= maxOpenAiT3) {
        body.dimensions = expectedDim;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.warn('batch embeddings failed', {
          status: res.status,
          errBody: errBody.slice(0, 500),
        });
        for (let j = 0; j < stillMissTexts.length; j++) {
          results[stillMissIndices[j]] = {
            embedding: this.deterministicEmbedding(stillMissTexts[j], expectedDim),
            provenance: null,
          };
        }
        return results;
      }
      const json = (await res.json()) as any;
      const items: any[] = json?.data ?? [];
      for (let j = 0; j < stillMissTexts.length; j++) {
        let emb = items[j]?.embedding as number[] | undefined;
        if (
          emb &&
          memCfg.embeddingProjectionEnabled &&
          memCfg.embeddingModelOutputDim !== expectedDim &&
          emb.length === memCfg.embeddingModelOutputDim
        ) {
          emb = projectEmbeddingLinearDown(emb, memCfg.embeddingModelOutputDim, expectedDim);
        }
        if (!emb || emb.length !== expectedDim) {
          emb = this.deterministicEmbedding(stillMissTexts[j], expectedDim);
          results[stillMissIndices[j]] = { embedding: emb, provenance: null };
        } else {
          const usageTok = parseEmbeddingUsageTokensFromJson(json);
          const inputTokens = usageTok != null ? Math.ceil(usageTok / stillMissTexts.length) : estimateEmbeddingInputTokens(stillMissTexts[j]);
          const result: EmbedTextResult = {
            embedding: emb,
            provenance: {
              llmModelId: null,
              modelName: m || 'unknown',
              providerCode: 'memory_env',
              inputTokens,
              llmKeyId: null,
            },
          };
          results[stillMissIndices[j]] = result;
        }
        const ck = createHash('sha256')
          .update(`${stillMissTexts[j]}|${expectedDim}`)
          .digest('hex');
        this.embedCache.set(ck, {
          embedding: results[stillMissIndices[j]].embedding,
          provenance: results[stillMissIndices[j]].provenance,
          expiresAt: Date.now() + EMBED_CACHE_TTL_MS,
        });
      }
    } catch (e: unknown) {
      this.logger.warn('embedTexts error', { message: e instanceof Error ? e.message : String(e) });
      for (let j = 0; j < stillMissTexts.length; j++) {
        if (!results[stillMissIndices[j]]) {
          results[stillMissIndices[j]] = {
            embedding: this.deterministicEmbedding(stillMissTexts[j], expectedDim),
            provenance: null,
          };
        }
      }
    }

    return results;
  }

  private zeroVector(dim: number): number[] {
    return Array.from({ length: dim }, () => 0);
  }

  private deterministicEmbedding(text: string, dim: number): number[] {
    const out = new Array<number>(dim);
    let h = createHash('sha256').update(text).digest();
    for (let i = 0; i < dim; i++) {
      if (i % 32 === 0 && i > 0) {
        h = createHash('sha256').update(h).update(String(i)).digest();
      }
      const b = h[i % 32] / 255 - 0.5;
      out[i] = b;
    }
    const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
    return out.map((v) => v / norm);
  }
}
