import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '../../common/config/config.service.js';
import type { CeoLayerConfigResolverService } from '../collaboration/ceo/resolver/ceo-layer-config-resolver.service.js';
import type {
  CompanyHeartbeatContext,
  CompanyStrategicContext,
} from './dto/company-heartbeat-context.dto.js';
import { buildStrategyCortexMemorySearchQuerySuffix } from '../collaboration/strategy-planning-profile.util.js';

type RoomMemberLite = {
  memberType?: string;
  memberId?: string;
  displayName?: string;
  role?: string;
};

type AgentLite = {
  id?: string;
  name?: string;
  role?: string;
};

export type CompanyBrainContext = {
  profile: string;
  profileHit: boolean;
  strategicNotes: string[];
  memorySignals: string[];
  activeAgentCount: number;
  roomMemberCount: number;
  missingFields: string[];
  summary: string;
};

type ProfileField = 'product' | 'customer' | 'goals' | 'org' | 'risk';
type FieldStatus = 'known' | 'undecided' | 'unknown';

type CompanyRowLite = {
  id?: string;
  description?: string | null;
};

@Injectable()
export class CompanyCortexService {
  private readonly logger = new Logger(CompanyCortexService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    @Optional() private readonly ceoLayerConfigResolver?: CeoLayerConfigResolverService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /** API `memory.companyProfile.get` 返回 `text`；历史误用 `profile` 字段会导致始终空串。 */
  private pickCompanyProfileRpcText(row: { text?: string | null; profile?: string | null } | null | undefined): string {
    if (!row || typeof row !== 'object') return '';
    return String((row as { text?: unknown }).text ?? (row as { profile?: unknown }).profile ?? '').trim();
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private async assessProfileFieldsWithLlm(input: {
    companyId: string;
    profile: string;
    strategicNotes: string[];
    memorySignals: string[];
    userMessage: string;
  }): Promise<Record<ProfileField, FieldStatus>> {
    const apiKey = String(this.config.getOpenAiApiKey() ?? '').trim();
    let modelName = '';
    if (this.ceoLayerConfigResolver) {
      const s = await this.ceoLayerConfigResolver.resolveLayerSetting(input.companyId, 'strategy');
      modelName = String(s.modelName ?? '').trim();
    }
    if (!modelName) {
      modelName = String(
        this.config.getCeoStrategyModel().trim() || this.config.getCollabIntentModel().trim(),
      ).trim();
    }
    if (!apiKey) {
      return {
        product: 'unknown',
        customer: 'unknown',
        goals: 'unknown',
        org: 'unknown',
        risk: 'unknown',
      };
    }
    const model = new ChatOpenAI({
      model: modelName,
      apiKey,
      timeout: Math.max(3000, Math.min(15000, this.config.getCollabIntentLlmTimeoutMs())),
      temperature: 0,
      maxTokens: 220,
    } as never);
    const mergedContext = {
      profile: input.profile,
      strategicNotes: input.strategicNotes.slice(0, 8),
      memorySignals: input.memorySignals.slice(0, 8),
      latestUserMessage: input.userMessage,
    };
    const prompt = [
      'You classify company profile completeness from context.',
      'Return JSON only, no markdown.',
      'Schema: {"product":"known|undecided|unknown","customer":"known|undecided|unknown","goals":"known|undecided|unknown","org":"known|undecided|unknown","risk":"known|undecided|unknown"}',
      'If user explicitly says undecided/not set yet, use "undecided" instead of unknown.',
      JSON.stringify(mergedContext),
    ].join('\n');
    try {
      const out = await model.invoke(prompt as any);
      const raw = String((out as any)?.content ?? '').trim();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const normalize = (v: unknown): FieldStatus =>
        v === 'known' || v === 'undecided' || v === 'unknown' ? v : 'unknown';
      return {
        product: normalize(parsed.product),
        customer: normalize(parsed.customer),
        goals: normalize(parsed.goals),
        org: normalize(parsed.org),
        risk: normalize(parsed.risk),
      };
    } catch (error) {
      this.logger.warn('foundry.ceo.v2.company_profile.assess_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        product: 'unknown',
        customer: 'unknown',
        goals: 'unknown',
        org: 'unknown',
        risk: 'unknown',
      };
    }
  }

  async getStrategicContext(ctx: CompanyHeartbeatContext): Promise<CompanyStrategicContext> {
    const actor = this.actor();
    const [profileRow, memory] = await Promise.all([
      this.rpc<{ text?: string | null; profile?: string | null }>('memory.companyProfile.get', {
        companyId: ctx.companyId,
        actor,
      }).catch(() => ({ text: null })),
      this.rpc<Array<{ content?: string | null }>>('memory.search', {
        companyId: ctx.companyId,
        actor,
        query: 'strategic priorities risks pending approvals budget execution',
        topK: 5,
      }).catch(() => []),
    ]);
    const memorySignals = (memory ?? [])
      .map((row) => String(row?.content ?? '').trim())
      .filter(Boolean)
      .slice(0, 5);
    const profileText = this.pickCompanyProfileRpcText(profileRow);
    const strategicNotes = [
      ...(profileText ? [profileText.slice(0, 800)] : []),
      'approval gate active',
    ];
    return {
      strategicNotes,
      memorySignals,
    };
  }

  /**
   * DB→memory 同步的公司档案正文（`CompanyProfileService`），供 replay 委托等 **确定性注入**，不依赖向量排序。
   */
  async getSyncedCompanyProfilePlaintext(companyId: string): Promise<string> {
    const row = await this.rpc<{ text?: string | null; profile?: string | null }>('memory.companyProfile.get', {
      companyId,
      actor: this.actor(),
    }).catch(() => ({ text: null }));
    return this.pickCompanyProfileRpcText(row);
  }

  async getCompanyBrainContext(input: {
    companyId: string;
    roomId: string;
    userMessage: string;
    /**
     * false：跳过 `assessProfileFieldsWithLlm`，`missingFields` 恒为空（事实快路径 / 召唤 / 非编排画像门禁等）。
     * 默认 true，保持向后兼容。
     */
    includeProfileGapAssessment?: boolean;
  }): Promise<CompanyBrainContext> {
    const actor = this.actor();
    const memorySearchQuery = `${String(input.userMessage ?? '').trim()} ${buildStrategyCortexMemorySearchQuerySuffix()}`.trim();
    const [profileResp, memoryHits, membersResp, agentsResp] = await Promise.all([
      this.rpc<{ text?: string | null; profile?: string | null }>('memory.companyProfile.get', {
        companyId: input.companyId,
        actor,
      }).catch(() => ({ text: null })),
      this.rpc<Array<{ content?: string | null }>>('memory.search', {
        companyId: input.companyId,
        actor,
        query: memorySearchQuery,
        topK: 6,
      }).catch(() => []),
      this.rpc<RoomMemberLite[]>('collaboration.members.list', {
        companyId: input.companyId,
        actor,
        roomId: input.roomId,
      }).catch(() => [] as RoomMemberLite[]),
      this.rpc<{ items?: AgentLite[] }>('agents.findAll', {
        companyId: input.companyId,
        actor,
        status: 'active',
        page: 1,
        pageSize: 100,
      }).catch(() => ({ items: [] as AgentLite[] })),
    ]);
    const profile = this.pickCompanyProfileRpcText(profileResp);
    const memorySignals = (Array.isArray(memoryHits) ? memoryHits : [])
      .map((row) => String(row?.content ?? '').trim())
      .filter(Boolean)
      .slice(0, 6);
    const members = Array.isArray(membersResp) ? membersResp : [];
    const agents = Array.isArray(agentsResp?.items) ? agentsResp.items : [];
    const strategicNotes = this.extractStrategicNotes(profile, memorySignals);
    const gapAssessment = input.includeProfileGapAssessment !== false;
    const fieldStatus = gapAssessment
      ? await this.assessProfileFieldsWithLlm({
          companyId: input.companyId,
          profile,
          strategicNotes,
          memorySignals,
          userMessage: input.userMessage,
        })
      : ({} as Record<ProfileField, FieldStatus>);
    const missingFields = gapAssessment
      ? (Object.entries(fieldStatus) as Array<[ProfileField, FieldStatus]>)
          .filter(([, status]) => status === 'unknown')
          .map(([field]) => field)
      : [];
    const summary = [
      profile ? `company_profile: ${profile.slice(0, 600)}` : 'company_profile: (missing)',
      `active_agents: ${agents.length}`,
      `room_members: ${members.length}`,
      strategicNotes.length ? `strategic_notes: ${strategicNotes.join(' | ').slice(0, 500)}` : '',
      memorySignals.length ? `memory_signals: ${memorySignals.map((x) => x.slice(0, 80)).join(' | ')}` : '',
      missingFields.length ? `missing_fields: ${missingFields.join(',')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      profile,
      profileHit: Boolean(profile),
      strategicNotes,
      memorySignals,
      activeAgentCount: agents.length,
      roomMemberCount: members.length,
      missingFields,
      summary: summary.slice(0, 2000),
    };
  }

  async persistProfileGapSignal(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    missingFields: string[];
    userMessage: string;
  }): Promise<void> {
    if (!input.missingFields.length) return;
    await this.rpc('memory.entries.store', {
      companyId: input.companyId,
      actor: this.actor(),
      data: {
        namespace: `company:${input.companyId}:ceo:profile:gaps`,
        collectionLabel: 'company_profile_gaps',
        sourceType: 'summary',
        content: JSON.stringify({
          messageId: input.messageId,
          roomId: input.roomId,
          userMessage: input.userMessage.slice(0, 200),
          missingFields: input.missingFields,
        }),
        metadata: {
          source: 'company_cortex.profile_gap',
          missingFields: input.missingFields,
          updatedAt: new Date().toISOString(),
        },
      },
    }).catch(() => undefined);
  }

  async autoHydratePrimaryProfileFromMessage(input: {
    companyId: string;
    roomId: string;
    messageId: string;
    userMessage: string;
    missingFields: string[];
  }): Promise<boolean> {
    const message = String(input.userMessage ?? '').trim();
    if (!message || message.length < 20) return false;
    if (!input.missingFields.length) return false;
    if (/[?？]/.test(message) && message.length < 80) return false;
    try {
      const current = await this.rpc<CompanyRowLite>('companies.findOne', {
        id: input.companyId,
      }).catch(() => ({} as CompanyRowLite));
      const prevDesc = String(current?.description ?? '').trim();
      const stamped = `[画像补充 ${new Date().toISOString()}] ${message.slice(0, 500)}`;
      const nextDesc = prevDesc ? `${prevDesc}\n${stamped}`.slice(0, 4000) : stamped;
      await this.rpc('companies.update', {
        id: input.companyId,
        actor: this.actor(),
        data: {
          description: nextDesc,
        },
      });
      await this.rpc('memory.companyProfile.sync', {
        companyId: input.companyId,
        actor: this.actor(),
      }).catch(() => undefined);
      this.logger.log('foundry.ceo.v2.company_profile.auto_hydrated', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        missingFields: input.missingFields,
      });
      return true;
    } catch (error) {
      this.logger.warn('foundry.ceo.v2.company_profile.auto_hydrate_failed', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private extractStrategicNotes(profile: string, signals: string[]): string[] {
    const chunks = [profile, ...signals].filter(Boolean);
    const notes = chunks
      .flatMap((x) => x.split(/[。.!?\n]/g))
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
    return Array.from(new Set(notes)).slice(0, 6);
  }
}
