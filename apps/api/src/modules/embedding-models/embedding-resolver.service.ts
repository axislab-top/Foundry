import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Counter } from '@service/monitoring';
import { Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { EmbeddingModelsService } from './embedding-models.service.js';
import { CompanyEmbeddingSettingsService } from './company-embedding-settings.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { extractEmbeddingVectorFromEmbeddingsJson } from '../../common/llm/openai-compatible-embedding-extract.js';
import { projectEmbeddingLinearDown } from '../../common/llm/embedding-projection.util.js';
import {
  isVolcArkVisionEmbeddingModelName,
  isVolcengineArkEmbeddingsBaseUrl,
} from '../../common/llm/volc-embedding-input.util.js';

export type EmbeddingPoolContext = {
  companyId: string;
  agentId?: string | null;
};

/** 完成池化 API 调用后的计费溯源（与 acquireCredentials 对应行一致） */
export type EmbeddingCallProvenance = {
  llmModelId: string;
  modelName: string;
  providerCode: string;
  inputTokens: number;
  llmKeyId?: string | null;
};

export type EmbeddingPoolResult = {
  embedding: number[];
  provenance: EmbeddingCallProvenance;
};

export function parseEmbeddingUsageTokensFromJson(json: unknown): number | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const u = (json as { usage?: unknown }).usage;
  if (!u || typeof u !== 'object') return undefined;
  const rec = u as Record<string, unknown>;
  const total = rec.total_tokens ?? rec.prompt_tokens ?? rec.input_tokens;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
    return Math.max(1, Math.floor(total));
  }
  if (typeof total === 'string') {
    const n = parseInt(total, 10);
    if (Number.isFinite(n) && n >= 0) return Math.max(1, n);
  }
  return undefined;
}

export function estimateEmbeddingInputTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** 全局命名空间，多 API 实例 + Redis 下避免与其它产品缓存键碰撞 */
const UNHEALTHY_CACHE_PREFIX = 'foundry:v1:emb:unhealthy:';
/** 与 LlmKeyResolver 的候选轮询一致：短 TTL，避免坏节点被反复命中 */
const UNHEALTHY_TTL_SECONDS = 50;
const MAX_POOL_ATTEMPTS = 3;

/**
 * Agent 级 Embedding 池解析：与 Worker 侧 `LlmKeyResolverService` 对称的「多候选 + 轮询 + 短缓存跳过坏节点」。
 * CEO 三层共享同一套候选（不按 layer 拆分 embedding）。
 */
@Injectable()
export class EmbeddingResolverService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingResolverService.name);
  private acquireCounter: Counter | null = null;

  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    private readonly embeddingModels: EmbeddingModelsService,
    private readonly companyEmbeddingSettings: CompanyEmbeddingSettingsService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly cache: CacheService,
    private readonly monitoring: MonitoringService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) return;
    try {
      this.acquireCounter =
        mm.getCounter('embedding_pool_acquire_total') ??
        mm.registerCounter({
          name: 'embedding_pool_acquire_total',
          help: 'Embedding pool acquire attempts (success, failover, exhausted, etc.)',
          labelNames: ['outcome'],
        });
    } catch (e: unknown) {
      this.logger.warn(`embedding pool metrics init skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private incAcquireOutcome(outcome: string): void {
    this.acquireCounter?.inc({ outcome }, 1);
  }

  private unhealthyKey(modelId: string): string {
    return `${UNHEALTHY_CACHE_PREFIX}${modelId}`;
  }

  private async isMarkedUnhealthy(modelId: string): Promise<boolean> {
    const v = await this.cache.get<string>(this.unhealthyKey(modelId));
    return v === '1';
  }

  private async markUnhealthy(modelId: string, reason: string): Promise<void> {
    await this.cache.set(this.unhealthyKey(modelId), '1', UNHEALTHY_TTL_SECONDS);
    this.logger.debug('embedding pool model marked unhealthy', { modelId, reason });
  }

  /**
   * Memory/RAG 为纯文本：非火山场景下，模型若配置在 `/embeddings/multimodal`，仍优先尝试同 base 的 `/embeddings`（OpenAI 兼容、纯 string input）。
   * 火山方舟：`doubao-embedding-vision-*` 等仅支持 multimodal；Ark 基址上 multimodal 配置时 **multimodal 优先**。
   * vision 模型名命中时 **不再** 回退 `/embeddings`，避免无意义 400 且覆盖 multimodal 的真实 errBody。
   */
  private resolveEmbeddingRequestUrlCandidates(
    endpointUrl: string,
    requestBaseUrl: string,
    modelName?: string,
  ): string[] {
    const ep = String(endpointUrl ?? '').trim();
    const base = String(requestBaseUrl ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!ep) return [];
    const lower = ep.toLowerCase();
    if (lower.includes('/embeddings/multimodal')) {
      const textUrl = `${base}/embeddings`;
      const seen = new Set<string>();
      const out: string[] = [];
      const multimodalFirst = isVolcengineArkEmbeddingsBaseUrl(base) || isVolcengineArkEmbeddingsBaseUrl(ep);
      const visionOnlyOnArk =
        multimodalFirst && isVolcArkVisionEmbeddingModelName(String(modelName ?? ''));
      if (visionOnlyOnArk) {
        return [ep];
      }
      const ordered = multimodalFirst ? [ep, textUrl] : [textUrl, ep];
      for (const u of ordered) {
        const k = u.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(u);
        }
      }
      return out;
    }
    return [ep];
  }

  private buildEmbeddingBodiesForUrl(
    endpointUrl: string,
    modelName: string,
    text: string,
    opts?: { arkMultimodalOutputDim?: number },
  ): Array<Record<string, unknown>> {
    const m = String(modelName ?? '').trim();
    const inputText = text.slice(0, 8000);
    const enc = { encoding_format: 'float' } as const;
    const lower = String(endpointUrl ?? '').toLowerCase();
    if (lower.includes('/embeddings/multimodal')) {
      const base = { model: m, input: [{ type: 'text', text: inputText }], ...enc };
      const dim = opts?.arkMultimodalOutputDim;
      if (isVolcengineArkEmbeddingsBaseUrl(lower) && (dim === 1024 || dim === 2048)) {
        return [{ ...base, dimensions: dim }, base];
      }
      return [base];
    }
    const standard = { model: m, input: inputText, ...enc };
    const textArray = { model: m, input: [inputText], ...enc };
    const multimodalText = { model: m, input: [{ type: 'text', text: inputText }], ...enc };
    if (lower.includes('/multimodal')) {
      return [multimodalText];
    }
    // 任意厂商的纯文本 /embeddings：禁止再发 content-part 形态，避免火山等报「map 而非 string」
    if (lower.includes('/embeddings') && !lower.includes('multimodal')) {
      return [standard, textArray];
    }
    // 方舟等：后缀若未含字面量 /embeddings（非常规 path），仍不得发 content-part，否则会命中仅支持 string 的网关并报 map 形态错误
    if (isVolcengineArkEmbeddingsBaseUrl(lower)) {
      return [standard, textArray];
    }
    return [standard, textArray, multimodalText];
  }

  /**
   * 解析 Embedding 候选（有序、去重）。
   *
   * 优先：公司级覆盖（company_embedding_settings.default_embedding_model_id）
   * 其次：平台级 Memory 默认 embedding（platform_settings.memory.defaultEmbeddingModelId）
   * 回退：公司对某 Marketplace Agent 的 assignment（company_marketplace_agent_key_assignments.assigned_embedding_model_id）
   */
  async resolveCandidateModelIds(ctx: EmbeddingPoolContext): Promise<string[]> {
    const companyOverrideId = await this.companyEmbeddingSettings.resolveEffectiveDefaultModelId(ctx.companyId);
    if (companyOverrideId) {
      return [companyOverrideId];
    }

    const platformDefaultId = await this.platformSettings.getEffectiveMemoryDefaultEmbeddingModelId();
    if (platformDefaultId) {
      return [platformDefaultId];
    }

    const agentId = ctx.agentId?.trim();
    if (!agentId) return [];

    const agent = await this.agentsRepo.findOne({
      where: { id: agentId, companyId: ctx.companyId },
      select: ['id', 'metadata'],
    });
    if (!agent) return [];

    const mpRaw =
      agent.metadata && typeof (agent.metadata as { marketplaceAgentId?: unknown }).marketplaceAgentId === 'string'
        ? String((agent.metadata as { marketplaceAgentId: string }).marketplaceAgentId).trim()
        : '';
    if (!mpRaw) return [];

    const assignment = await this.keyAssignmentsRepo.findOne({
      where: { companyId: ctx.companyId, marketplaceAgentId: mpRaw },
    });
    const id = assignment?.assignedEmbeddingModelId?.trim();
    return id ? [id] : [];
  }

  /**
   * 解析公司/平台默认 embedding 模型在库中配置的向量维度（无配置则 null）。
   */
  async resolveDefaultEmbeddingDimensions(ctx: EmbeddingPoolContext): Promise<number | null> {
    const ids = await this.resolveCandidateModelIds(ctx);
    for (const id of ids) {
      const d = await this.embeddingModels.getEmbeddingDimensionsForLlmModel(id);
      if (d != null) return d;
    }
    return null;
  }

  /**
   * 使用池化候选调用 OpenAI 兼容 /embeddings；失败则 failover，全部失败返回 null（由 {@link EmbeddingService} 走 env / 确定性降级）。
   */
  async tryEmbedFromPool(
    text: string,
    ctx: EmbeddingPoolContext,
    expectedDimensions: number,
  ): Promise<EmbeddingPoolResult | null> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) return null;

    const primary = await this.resolveCandidateModelIds(ctx);
    const fallbackId = this.config.getMemoryEmbeddingPoolFallbackModelId();
    const candidates = [...primary, ...(fallbackId && !primary.includes(fallbackId) ? [fallbackId] : [])];
    if (!candidates.length) {
      this.incAcquireOutcome('no_candidates');
      return null;
    }

    const healthyOrdered: string[] = [];
    for (const id of candidates) {
      if (await this.isMarkedUnhealthy(id)) {
        this.logger.log('embedding pool skip unhealthy (cache)', { modelId: id, agentId: ctx.agentId });
        continue;
      }
      healthyOrdered.push(id);
    }
    let toTry = healthyOrdered.slice(0, MAX_POOL_ATTEMPTS);
    if (!toTry.length && fallbackId) {
      this.logger.warn('embedding pool primary line unhealthy; retrying fallback model ignoring cache', {
        fallbackId,
        agentId: ctx.agentId,
        companyId: ctx.companyId,
      });
      toTry = [fallbackId].slice(0, MAX_POOL_ATTEMPTS);
      this.incAcquireOutcome('fallback_bypass_unhealthy_cache');
    }
    /** 池内候选均被短缓存标为 unhealthy 且未配置独立 fallback 时，仍按候选顺序直连重试（避免 RAG 全链路因瞬时故障停摆）。 */
    if (!toTry.length && candidates.length) {
      const dedup = [...new Set(candidates.map((id) => String(id ?? '').trim()).filter(Boolean))];
      toTry = dedup.slice(0, MAX_POOL_ATTEMPTS);
      if (toTry.length) {
        this.logger.warn('embedding pool all candidates marked unhealthy in cache; retrying pool order ignoring markers', {
          companyId: ctx.companyId,
          agentId: ctx.agentId,
          modelIds: toTry,
        });
        this.incAcquireOutcome('bypass_unhealthy_cache_pool');
      }
    }
    if (!toTry.length) {
      this.incAcquireOutcome('all_unhealthy_cached');
      return null;
    }

    for (let i = 0; i < toTry.length; i++) {
      const modelId = toTry[i];

      if (i > 0) {
        this.logger.warn('embedding pool failover', {
          companyId: ctx.companyId,
          agentId: ctx.agentId,
          attemptIndex: i,
          toModelId: modelId,
          previousModelId: toTry[i - 1],
        });
      }

      try {
        const cred = await this.embeddingModels.acquireCredentials(modelId);
        if (!cred.apiKey?.trim()) {
          await this.markUnhealthy(modelId, 'no_api_key');
          continue;
        }
        let primaryUrl = cred.endpointUrl?.trim()
          ? cred.endpointUrl.trim()
          : `${cred.requestUrl.replace(/\/$/, '')}/embeddings`;
        const requestBase = cred.requestUrl.replace(/\/$/, '');
        if (
          isVolcengineArkEmbeddingsBaseUrl(primaryUrl) &&
          isVolcArkVisionEmbeddingModelName(cred.modelName)
        ) {
          const low = primaryUrl.toLowerCase();
          if (low.includes('/embeddings') && !low.includes('multimodal')) {
            const coerced = `${primaryUrl.replace(/\/embeddings\/?$/i, '')}/embeddings/multimodal`;
            this.logger.warn('embedding pool: ark vision model had text-only path; coercing to multimodal URL', {
              modelId,
              modelName: cred.modelName,
              before: primaryUrl,
              after: coerced,
            });
            primaryUrl = coerced;
          }
        }
        const urlCandidates = this.resolveEmbeddingRequestUrlCandidates(primaryUrl, requestBase, cred.modelName);
        let lastStatus: number | null = null;
        let lastErrorBody = '';
        let lastFailedUrl = '';
        const memCfg = this.config.getMemoryConfig();
        const targetDim = expectedDimensions;
        const modelOutDim = memCfg.embeddingProjectionEnabled
          ? cred.dimensions != null && cred.dimensions > 0
            ? cred.dimensions
            : memCfg.embeddingModelOutputDim
          : cred.dimensions != null && cred.dimensions > 0
            ? cred.dimensions
            : targetDim;
        const arkMmDim = modelOutDim === 1024 || modelOutDim === 2048 ? modelOutDim : undefined;
        for (const url of urlCandidates) {
          const bodyCandidates = this.buildEmbeddingBodiesForUrl(url, cred.modelName, trimmed, {
            arkMultimodalOutputDim: arkMmDim,
          });
          for (const body of bodyCandidates) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), memCfg.embeddingFetchTimeoutMs);
            let res: Response;
            try {
              res = await fetch(url, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${cred.apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timer);
            }
            if (!res.ok) {
              lastStatus = res.status;
              lastFailedUrl = url;
              lastErrorBody = (await res.text()).slice(0, 400);
              continue;
            }
            const json = (await res.json()) as unknown;
            const emb = extractEmbeddingVectorFromEmbeddingsJson(json);
            if (!emb?.length) {
              lastStatus = null;
              lastFailedUrl = url;
              lastErrorBody = `empty_or_unparseable_embedding: ${JSON.stringify(json).slice(0, 280)}`;
              continue;
            }
            let vec = emb;
            if (memCfg.embeddingProjectionEnabled && modelOutDim !== targetDim && vec.length === modelOutDim) {
              vec = projectEmbeddingLinearDown(vec, modelOutDim, targetDim);
              this.logger.debug('embedding pool post-projection', {
                modelId,
                modelOutDim,
                targetDim,
              });
            }
            if (vec.length !== targetDim) {
              lastFailedUrl = url;
              lastErrorBody = `dim_mismatch: got ${vec.length}, required ${targetDim} (modelOut=${modelOutDim}, llm_models.embedding_dimensions=${cred.dimensions ?? 'null'}, projection=${memCfg.embeddingProjectionEnabled})`;
              this.logger.warn('embedding pool dim mismatch', {
                modelId,
                got: vec.length,
                targetDim,
                modelOutDim,
                credDimensions: cred.dimensions,
                projection: memCfg.embeddingProjectionEnabled,
                requestUrl: url,
              });
              continue;
            }
            this.incAcquireOutcome(i === 0 ? 'success' : 'failover');
            const usageTok = parseEmbeddingUsageTokensFromJson(json);
            const inputTokens = usageTok ?? estimateEmbeddingInputTokens(trimmed);
            return {
              embedding: vec,
              provenance: {
                llmModelId: String(modelId),
                modelName: cred.modelName,
                providerCode: cred.provider,
                inputTokens,
                llmKeyId: cred.llmKeyId ?? null,
              },
            };
          }
        }
        await this.markUnhealthy(
          modelId,
          lastStatus ? `http_${lastStatus}` : lastErrorBody ? 'response_rejected' : 'invalid_embedding_payload',
        );
        this.logger.warn('embedding pool candidate failed (all URL/body attempts exhausted)', {
          modelId,
          status: lastStatus,
          lastFailedUrl,
          errBody: lastErrorBody,
          urlsTried: urlCandidates,
        });
        continue;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
          this.logger.warn('embedding pool fetch timed out', { modelId });
          throw e;
        }
        await this.markUnhealthy(modelId, 'exception');
        this.logger.warn('embedding pool attempt failed', {
          modelId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.incAcquireOutcome('pool_exhausted');
    return null;
  }
}
