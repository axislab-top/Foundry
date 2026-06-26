import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../../../common/logging/collab-llm-trace.util.js';
import type { CeoDecisionInputUnion } from '../dto/ceo-v2-pipeline.types.js';
import { CeoDecisionInputBridge } from '../dto/ceo-v2-pipeline.types.js';
import { CeoLayerConfigResolverService } from './ceo-layer-config-resolver.service.js';
import { CeoInteractiveQueueService } from '../queue/ceo-interactive-queue.service.js';
import { EnforceModelType } from '../../../../common/llm-rules/model-type.decorator.js';
import { LLMRoutingRuleEnforcer } from '../../../../common/llm-rules/llm-routing-rule.enforcer.js';
import { EMBEDDING_MODEL_PATTERNS } from '../../../../config/llm.config.js';
import {
  StructuredConfigQueryException,
  StructuredLLMRoutingException,
} from '../../../../common/exceptions/structured-config-query.exception.js';

type AgentModelSlice = {
  llmModel?: string | null;
  llmKeyId?: string | null;
};

@Injectable()
export class DecisionConfigResolverService {
  private readonly logger = new Logger(DecisionConfigResolverService.name);
  private readonly cache = new Map<string, { exp: number; modelName: string; keyId: string }>();

  private isEmbeddingLikeModel(modelName: string | null | undefined): boolean {
    const n = String(modelName ?? '').trim().toLowerCase();
    if (!n) return false;
    return /\bembedding(s)?\b/.test(n) || n.includes('text-embedding') || n.includes('bge-');
  }

  constructor(
    private readonly config: ConfigService,
    private readonly ceoQueue: CeoInteractiveQueueService,
    private readonly layerConfigResolver: CeoLayerConfigResolverService,
    private readonly modelRuleEnforcer: LLMRoutingRuleEnforcer,
  ) {}

  invalidateCompany(companyId: string): void {
    this.cache.delete(this.cacheKey(companyId));
  }

  private cacheKey(companyId: string): string {
    return `ceo:config:${companyId}`;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const rec = e as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      const response = rec.response;
      if (response && typeof response === 'object') {
        const m = (response as Record<string, unknown>).message;
        if (typeof m === 'string') return m;
        if (Array.isArray(m)) return m.map((x) => String(x)).join('; ');
      }
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    }
    return String(e);
  }

  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return this.ceoQueue.send<T>(pattern, payload);
  }

  private getCached(companyId: string): { modelName: string; keyId: string } | null {
    const row = this.cache.get(this.cacheKey(companyId));
    if (!row || row.exp < Date.now()) {
      if (row) this.cache.delete(companyId);
      return null;
    }
    return { modelName: row.modelName, keyId: row.keyId };
  }

  private setCached(companyId: string, modelName: string, keyId: string): void {
    this.cache.set(this.cacheKey(companyId), {
      exp: Date.now() + 15_000,
      modelName,
      keyId,
    });
  }

  async resolveDecisionConfig(input: CeoDecisionInputUnion): Promise<{ modelName: string; keyId: string }> {
    const base = CeoDecisionInputBridge.asLegacy(input);
    const hit = this.getCached(base.companyId);
    if (hit) return hit;

    let modelName = '';
    let keyId = '';
    try {
      const setting = await this.layerConfigResolver.resolveLayerSetting(base.companyId, 'strategy');
      modelName = setting.modelName.trim();
      if (modelName) {
        try {
          this.modelRuleEnforcer.enforceChatRequired({
            modelOrKey: modelName,
            companyId: base.companyId,
            phase: 'decision_resolver',
            configSource: 'ceoLayerConfig',
            patterns: EMBEDDING_MODEL_PATTERNS,
          });
        } catch {
          throw new StructuredLLMRoutingException({
            ruleViolated: 'chat-required',
            configSource: 'ceoLayerConfig',
            companyId: base.companyId,
            phase: 'strategy',
            modelOrKey: modelName,
          });
        }
      }
      keyId = setting.keySource === 'dedicated' && setting.llmKeyId ? setting.llmKeyId.trim() : '';
    } catch (e: unknown) {
      const ex = new StructuredConfigQueryException({
        phase: 'decision_resolver',
        companyId: base.companyId,
        requestedKey: 'companies.ceoLayerConfig.getConfig',
        originalError: this.formatError(e),
      });
      this.logger.warn('ceo decision config lookup failed', {
        companyId: base.companyId,
        messageId: base.messageId,
        message: ex.details?.originalError,
        trace: COLLAB_LLM_TRACE,
      });
      throw ex;
    }

    this.setCached(base.companyId, modelName, keyId);
    return { modelName, keyId };
  }

  @EnforceModelType('chat')
  async resolveDecisionModelName(input: CeoDecisionInputUnion, configuredModel: string): Promise<string> {
    const base = CeoDecisionInputBridge.asLegacy(input);
    const cfg = await this.resolveDecisionConfig(input);
    if (cfg.modelName && !this.isEmbeddingLikeModel(cfg.modelName)) return cfg.modelName;
    if (configuredModel.trim() && !this.isEmbeddingLikeModel(configuredModel)) return configuredModel.trim();

    const ceoId = base.ceoAgentId?.trim();
    if (!ceoId) return '';

    try {
      const ceo = await this.rpcWithRetry<AgentModelSlice>('agents.findOne', {
        companyId: base.companyId,
        actor: this.workerActor(),
        id: ceoId,
      });
      const model = (ceo?.llmModel ?? '').trim();
      if (!model || this.isEmbeddingLikeModel(model)) return '';
      this.modelRuleEnforcer.enforceChatRequired({
        modelOrKey: model,
        companyId: base.companyId,
        phase: 'decision_resolver',
        configSource: 'agentModel',
        patterns: EMBEDDING_MODEL_PATTERNS,
      });
      return model;
    } catch {
      return '';
    }
  }

  async resolveDecisionAgentOverride(
    input: CeoDecisionInputUnion,
  ): Promise<{ llmModel?: string | null; llmKeyId?: string | null } | undefined> {
    const base = CeoDecisionInputBridge.asLegacy(input);
    const ceoId = base.ceoAgentId?.trim();
    if (!ceoId) return undefined;

    try {
      const decisionConfig = await this.resolveDecisionConfig(input);
      const ceo = await this.rpcWithRetry<AgentModelSlice>('agents.findOne', {
        companyId: base.companyId,
        actor: this.workerActor(),
        id: ceoId,
      });
      if (!decisionConfig.modelName && !decisionConfig.keyId) return undefined;
      const decisionModel = this.isEmbeddingLikeModel(decisionConfig.modelName) ? '' : decisionConfig.modelName;
      const ceoModelRaw = (ceo?.llmModel ?? '').trim();
      const ceoModel = this.isEmbeddingLikeModel(ceoModelRaw) ? '' : ceoModelRaw;
      return {
        llmModel: decisionModel || ceoModel || null,
        // Do not inherit agent fixed llmKeyId in strategy path.
        // Agent row may store embedding/retrieval key snapshots.
        llmKeyId: decisionConfig.keyId || null,
      };
    } catch {
      return undefined;
    }
  }
}

