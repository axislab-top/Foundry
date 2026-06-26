import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createHash } from 'crypto';
import { TenantContextService } from '@service/tenant';
import { ConfigService } from '../../../common/config/config.service.js';
import { GroupChatContextService } from '../group-chat-context.service.js';
import { CeoInteractiveQueueService } from '../ceo/queue/ceo-interactive-queue.service.js';
import type { CeoDecisionInput, CeoDecisionInputUnion } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CeoDecisionInputBridge } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import { L1FeatureFlagService } from './l1-feature-flag.service.js';
import { AgentsActiveDirectoryCacheService } from '../context/agents-active-directory-cache.service.js';

type MemorySearchHit = { content?: string; score?: number };

export type PreContextResult = {
  humanIdentityDigest: string;
  transcriptSummary: string;
  vectorEvidence: string;
  decisionFingerprint: string;
  cacheKey: string;
};

@Injectable()
export class PreContextService {
  private readonly logger = new Logger(PreContextService.name);
  private readonly cache = new Map<string, { exp: number; value: PreContextResult }>();

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly groupChat: GroupChatContextService,
    private readonly ceoQueue: CeoInteractiveQueueService,
    private readonly collabLlm: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly l1FeatureFlag: L1FeatureFlagService,
    private readonly agentsDirectoryCache: AgentsActiveDirectoryCacheService,
  ) {}

  private cacheKey(input: CeoDecisionInputUnion): string {
    const base = CeoDecisionInputBridge.asLegacy(input);
    const u = CeoDecisionInputBridge.tryUnified(input);
    const h = createHash('sha256');
    h.update(
      JSON.stringify({
        m: base.messageId,
        c: base.companyId,
        r: base.roomId,
        t: base.contentText.slice(0, 1200),
        ri: base.recentInterlocutorAgentId ?? '',
        rp: (base.recentInterlocutorLastPreview ?? '').slice(0, 180),
        mr: base.mentionedAgentIds,
        uTrace: u?.traceId ?? '',
        uIntent: u ? `${u.intentType}:${u.confidence}` : '',
      }),
    );
    return `company:${base.companyId}:l1:pre_context:${h.digest('hex')}`;
  }

  private getCached(key: string): PreContextResult | null {
    const row = this.cache.get(key);
    if (!row || row.exp <= Date.now()) {
      if (row) this.cache.delete(key);
      return null;
    }
    return row.value;
  }

  private setCached(key: string, value: PreContextResult): void {
    this.cache.set(key, { exp: Date.now() + 15_000, value });
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private compactTokenLike(text: string, maxWords: number): string {
    const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words.slice(0, Math.max(10, maxWords)).join(' ');
  }

  private async compressDecisionFingerprintByLlm(
    companyId: string,
    messageId: string,
    ceoAgentId: string | null,
    raw: string,
  ): Promise<string> {
    const layerSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(companyId, 'strategy');
    const m = String(layerSetting.modelName ?? '').trim();
    if (!m) {
      throw new Error('l1_pre_context_admin_strategy_model_unconfigured');
    }
    const meterId = (ceoAgentId ?? '').trim() || undefined;
    const model = await this.collabLlm.createChatModel({
      companyId,
      fallbackModelName: m,
      llmTimeoutMs: Math.max(1200, Math.min(4000, this.config.getCollabIntentLlmTimeoutMs())),
      maxOutputTokens: 140,
      taskPriority: 'normal',
      ceoContext: 'strategy',
      trace: { messageId, callsite: 'l1:pre_context:fingerprint' },
      meteringAgentId: meterId,
    });
    const res = await model.invoke([
      new SystemMessage('Compress to a compact decision fingerprint (<200 tokens). Keep key identity, mentions, intent and constraints. No markdown.'),
      new HumanMessage(raw.slice(0, 2400)),
    ]);
    const out =
      typeof res.content === 'string'
        ? res.content
        : Array.isArray(res.content)
          ? res.content.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
          : JSON.stringify(res.content);
    return this.compactTokenLike(out, 190);
  }

  private async buildHumanIdentityDigest(input: CeoDecisionInput): Promise<string> {
    const userId = (input.humanSenderId ?? '').trim();
    if (!userId) return '';
    const pack = await this.groupChat
      .buildHumanIdentityPack({
        companyId: input.companyId,
        roomId: input.roomId,
        userId,
        timeoutMs: Math.min(2000, this.config.getCollaborationMentionRpcTimeoutMs()),
        traceMessageId: input.messageId,
      })
      .catch(() => null);
    if (!pack) return '';
    return [pack.telemetryLabel ?? '', pack.compactLine ?? '', pack.block ?? '']
      .join(' | ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
  }

  private async buildTranscriptSummary(input: CeoDecisionInput): Promise<string> {
    const list = await this.ceoQueue
      .send<{ items?: Array<{ senderType?: string; content?: string | null; seq?: number | string }> }>('collaboration.messages.list', {
        companyId: input.companyId,
        actor: this.workerActor(),
        roomId: input.roomId,
        limit: 60,
      })
      .catch(() => ({ items: [] }));
    const rows = Array.isArray(list?.items) ? list.items : [];
    const last3 = rows.slice(-18);
    const lines = last3
      .filter((x) => String(x?.content ?? '').trim())
      .slice(-12)
      .map((x) => `[${String(x.senderType ?? 'unknown')}:${String(x.seq ?? '')}] ${String(x.content ?? '').slice(0, 240)}`);
    return lines.join('\n').slice(0, 2600);
  }

  private buildTranscriptFromRows(rows: Array<{ senderType?: string; content?: string | null; seq?: number | string }>): string {
    const last3 = rows.slice(-18);
    const lines = last3
      .filter((x) => String(x?.content ?? '').trim())
      .slice(-12)
      .map((x) => `[${String(x.senderType ?? 'unknown')}:${String(x.seq ?? '')}] ${String(x.content ?? '').slice(0, 240)}`);
    return lines.join('\n').slice(0, 2600);
  }

  private buildVectorFromHits(hits: MemorySearchHit[]): string {
    const arr = Array.isArray(hits) ? hits : [];
    if (!arr.length) return '';
    return arr
      .slice(0, 3)
      .map((h, i) => `${i + 1}. score=${Number(h.score ?? 0).toFixed(4)} ${String(h.content ?? '').slice(0, 180)}`)
      .join('\n')
      .slice(0, 900);
  }

  private async buildTranscriptAndVectorEvidence(input: CeoDecisionInput): Promise<{
    transcript: string;
    vectorEvidence: string;
  }> {
    const actor = this.workerActor();
    const [list, hits] = await Promise.all([
      this.ceoQueue
        .send<{ items?: Array<{ senderType?: string; content?: string | null; seq?: number | string }> }>('collaboration.messages.list', {
          companyId: input.companyId,
          actor,
          roomId: input.roomId,
          limit: 60,
        })
        .catch(() => ({ items: [] })),
      this.ceoQueue
        .send<MemorySearchHit[]>('memory.search', {
          companyId: input.companyId,
          actor,
          data: {
            query: input.contentText.slice(0, 1000),
            roomId: input.roomId,
            namespaces: [`company:${input.companyId}:ceo:layer:L1`],
            topK: 3,
            minScore: 0.2,
          },
        })
        .catch(() => [] as MemorySearchHit[]),
    ]);
    const rows = Array.isArray(list?.items) ? list.items : [];
    return {
      transcript: this.buildTranscriptFromRows(rows),
      vectorEvidence: this.buildVectorFromHits(Array.isArray(hits) ? hits : []),
    };
  }

  private async buildVectorEvidence(input: CeoDecisionInput): Promise<string> {
    const hits = await this.ceoQueue
      .send<MemorySearchHit[]>('memory.search', {
        companyId: input.companyId,
        actor: this.workerActor(),
        data: {
          query: input.contentText.slice(0, 1000),
          roomId: input.roomId,
          namespaces: [`company:${input.companyId}:ceo:layer:L1`],
          topK: 3,
          minScore: 0.2,
        },
      })
      .catch(() => [] as MemorySearchHit[]);
    const arr = Array.isArray(hits) ? hits : [];
    if (!arr.length) return '';
    return arr
      .slice(0, 3)
      .map((h, i) => `${i + 1}. score=${Number(h.score ?? 0).toFixed(4)} ${String(h.content ?? '').slice(0, 180)}`)
      .join('\n')
      .slice(0, 900);
  }

  async buildClassifierContext(input: CeoDecisionInputUnion): Promise<PreContextResult> {
    const base = CeoDecisionInputBridge.asLegacy(input);
    return this.tenantContext.runWithCompanyId(base.companyId, async () => {
      const ck = this.cacheKey(input);
      const hit = this.getCached(ck);
      if (hit) return hit;

      /** 与 RoomContext 共用 agents.findAll 切片缓存，避免同请求链重复 RPC。 */
      void this.agentsDirectoryCache.getActiveAgents(base.companyId, this.workerActor()).catch(() => []);

      const [identity, ctx, preContextEnabled] = await Promise.all([
        this.buildHumanIdentityDigest(base),
        this.buildTranscriptAndVectorEvidence(base),
        this.l1FeatureFlag.isPreContextEnabled(base.companyId),
      ]);
      const transcript = ctx.transcript;
      const vectorEvidence = ctx.vectorEvidence;

      const raw = [
        `identity=${identity}`,
        `transcript=${transcript}`,
        `vectorEvidence=${vectorEvidence}`,
        `mentions=${base.mentionedAgentIds.join(',')}`,
        `latest=${base.contentText.slice(0, 800)}`,
      ]
        .filter(Boolean)
        .join('\n');
      const fingerprint = preContextEnabled
        ? await this.compressDecisionFingerprintByLlm(base.companyId, base.messageId, base.ceoAgentId, raw).catch(() =>
            this.compactTokenLike(raw, 190),
          )
        : this.compactTokenLike(raw, 190);

      const out: PreContextResult = {
        humanIdentityDigest: identity,
        transcriptSummary: transcript,
        vectorEvidence,
        decisionFingerprint: fingerprint,
        cacheKey: ck,
      };
      this.setCached(ck, out);
      this.logger.log(`${COLLAB_LLM_TRACE} | l1.pre_context`, {
        companyId: base.companyId,
        messageId: base.messageId,
        preContextEnabled,
        fingerprintWords: fingerprint.split(/\s+/).filter(Boolean).length,
      });
      return out;
    });
  }
}
