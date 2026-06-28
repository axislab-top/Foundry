import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { SecurityService } from '../../common/security/security.service.js';
import { LlmKey } from './entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from './entities/llm-key-daily-usage.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { BillingRecord } from '../billing/entities/billing-record.entity.js';
import { BillingSettings } from '../billing/entities/billing-settings.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgentKeyBinding } from '../templates/entities/marketplace-agent-key-binding.entity.js';
import type { LlmKeyInfo, LlmKeyPoolGroup, LlmKeysAcquireResult } from './interfaces/llm-key.interface.js';
import { extractEmbeddingVectorFromEmbeddingsJson } from '../../common/llm/openai-compatible-embedding-extract.js';
import { embeddingsPathExpectsStringInputOnly } from '../../common/llm/volc-embedding-input.util.js';
import { isEmbeddingLikeByPatterns } from '../../common/llm-rules/model-type.schema.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';

function toUsageDateUTC(d: Date): string {
  // 使用 UTC 日期，避免跨时区导致“今日”定义漂移
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * 与 {@link EmbeddingResolverService.tryEmbedFromPool} 一致：校验 JSON 中首条向量，避免网关返回空 200。
 * 使用短但含中英与标点的文本，贴近 Memory/RAG 块形态（非单字 ping）。
 */
const EMBEDDING_CONNECTIVITY_PROBE_TEXT =
  '这是一段用于后台 Key 连通性检测的嵌入探针文本，模拟 RAG 记忆块长度与字符分布。Embedding probe EN: connectivity check sample v1 deterministic.';

function parseEmbeddingConnectivityResponse(bodyText: string): { ok: true; dimensions: number } | { ok: false; reason: string } {
  try {
    const j = JSON.parse(bodyText) as unknown;
    const emb = extractEmbeddingVectorFromEmbeddingsJson(j);
    if (!emb) {
      return { ok: false, reason: 'missing_or_empty_embedding' };
    }
    return { ok: true, dimensions: emb.length };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

/** 与 Worker 排障日志对齐：搜 `collab-llm-trace`，不记录密钥明文 */
function safeLlmBaseUrlForLogApi(url: string | undefined | null): string {
  if (!url?.trim()) return '(default)';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.protocol}//${u.host}${path}`.slice(0, 180);
  } catch {
    return '(invalid-url)';
  }
}

/** Provider / 模型筛选：大小写不敏感、子串匹配（避免精确匹配导致“搜不到”） */
function applyLlmKeyListFilters(
  qb: SelectQueryBuilder<LlmKey>,
  filters: { provider?: string; modelName?: string; isActive?: boolean },
): void {
  const prov = (filters.provider ?? '').trim();
  if (prov) {
    qb.andWhere('POSITION(LOWER(:llmFilterProvider) IN LOWER(k.provider)) > 0', {
      llmFilterProvider: prov,
    });
  }
  const mod = (filters.modelName ?? '').trim();
  if (mod) {
    qb.andWhere('POSITION(LOWER(:llmFilterModel) IN LOWER(k.modelName)) > 0', {
      llmFilterModel: mod,
    });
  }
  if (filters.isActive !== undefined) {
    qb.andWhere('k.isActive = :isActive', { isActive: filters.isActive });
  }
}

@Injectable()
export class LlmKeysService {
  private readonly logger = new Logger(LlmKeysService.name);
  private readonly embeddingPatterns = ['embedding', 'text-embedding', 'bge-', 'vector'];

  private enforceChatModel(modelOrKey: string, path: 'acquire' | 'acquireById'): void {
    if (!isEmbeddingLikeByPatterns(modelOrKey, this.embeddingPatterns)) return;
    throw new BadRequestException(
      `MODEL_TYPE_RULE_VIOLATION: chat-required path=${path} model=${modelOrKey}`,
    );
  }

  constructor(
    @InjectRepository(LlmKey)
    private readonly llmKeyRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage)
    private readonly dailyUsageRepo: Repository<LlmKeyDailyUsage>,
    @InjectRepository(LlmProvider)
    private readonly llmProviderRepo: Repository<LlmProvider>,
    @InjectRepository(LlmModel)
    private readonly llmModelRepo: Repository<LlmModel>,
    @InjectRepository(BillingRecord)
    private readonly billingRepo: Repository<BillingRecord>,
    private readonly securityService: SecurityService,
  ) {}

  /**
   * 日配额仅用于监控与软预警（remaining 低于 15%），不用于拒绝 acquire。
   */
  private quotaSoftSignal(
    usedTodayTokens: number,
    dailyQuotaTokens: string,
  ): Pick<LlmKeysAcquireResult, 'remainingQuotaPercent' | 'warning'> {
    const quotaNum = Number(dailyQuotaTokens);
    if (!Number.isFinite(quotaNum) || quotaNum <= 0) {
      return {};
    }
    const rem = Math.max(0, quotaNum - usedTodayTokens);
    const ratio = rem / quotaNum;
    const remainingQuotaPercent = Math.round(ratio * 10000) / 100;
    if (ratio < 0.15) {
      return { remainingQuotaPercent, warning: 'llm_key_daily_quota_remaining_below_15pct' };
    }
    return { remainingQuotaPercent };
  }

  private async resolveProviderByCode(code: string): Promise<LlmProvider | null> {
    const c = (code ?? '').trim();
    if (!c) return null;
    const direct = await this.llmProviderRepo.findOne({ where: { code: c } });
    if (direct) return direct;
    return await this.llmProviderRepo
      .createQueryBuilder('p')
      .where('LOWER(p.code) = LOWER(:code)', { code: c })
      .getOne();
  }

  private async resolveModelRequestPathSuffix(params: {
    llmModelId?: string | null;
    provider: string;
    modelName: string;
  }): Promise<string | null> {
    if (params.llmModelId?.trim()) {
      const byId = await this.llmModelRepo.findOne({ where: { id: params.llmModelId.trim() } });
      if (byId) return byId.requestPathSuffix;
    }
    const byNaturalKey = await this.llmModelRepo.findOne({
      where: {
        providerCode: params.provider,
        modelName: params.modelName
      } as any,
      order: { updatedAt: 'DESC' }
    });
    return byNaturalKey?.requestPathSuffix ?? null;
  }

  private async encryptSecretToBase64(secret: string): Promise<string> {
    const encryptionManager = this.securityService.getEncryptionManager();
    const res = await encryptionManager.encrypt(secret, { algorithm: 'aes-256-gcm' });

    const encryptedBase64 = Buffer.isBuffer(res.encrypted)
      ? res.encrypted.toString('base64')
      : Buffer.from(res.encrypted).toString('base64');

    const ivBase64 = res.iv ? (Buffer.isBuffer(res.iv) ? res.iv.toString('base64') : String(res.iv)) : '';
    const tagBase64 = res.tag ? (Buffer.isBuffer(res.tag) ? res.tag.toString('base64') : String(res.tag)) : '';

    const combined = JSON.stringify({
      encrypted: encryptedBase64,
      iv: ivBase64,
      tag: tagBase64,
    });
    return Buffer.from(combined, 'utf8').toString('base64');
  }

  private async decryptSecretFromBase64(encryptedBase64: string): Promise<string> {
    const encryptionManager = this.securityService.getEncryptionManager();
    const combined = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8')) as {
      encrypted: string;
      iv: string;
      tag?: string;
    };

    const iv = combined.iv ? Buffer.from(combined.iv, 'base64') : undefined;
    const tag = combined.tag ? Buffer.from(combined.tag, 'base64') : undefined;

    const decrypted = await encryptionManager.decrypt(Buffer.from(combined.encrypted, 'base64'), {
      iv,
      tag,
    });

    const plain = Buffer.isBuffer(decrypted) ? decrypted.toString('utf8') : String(decrypted);
    // 粘贴/导入时常带入首尾空白；OpenAI 等会原样校验导致 401，与「key 在控制台可用」表象不一致
    return plain.trim();
  }

  private async buildKeyInfos(keys: LlmKey[]): Promise<LlmKeyInfo[]> {
    const usageDate = toUsageDateUTC(new Date());
    const ids = keys.map((k) => k.id);
    const boundSet = new Set<string>();
    if (ids.length) {
      try {
        const rows = await this.llmKeyRepo.query(
          `select llm_key_id from marketplace_agent_key_bindings where llm_key_id = any($1::uuid[])`,
          [ids],
        );
        for (const r of rows as Array<{ llm_key_id?: string; llmKeyId?: string }>) {
          const id = (r.llm_key_id ?? r.llmKeyId ?? '').trim();
          if (id) boundSet.add(id);
        }
      } catch {
        // ignore: binding status is best-effort in list response
      }
    }

    const usageRows = ids.length
      ? await this.dailyUsageRepo.find({
          where: {
            llmKeyId: In(ids),
            usageDate,
          },
        })
      : [];
    const usageMap = new Map<string, LlmKeyDailyUsage>();
    for (const u of usageRows) usageMap.set(u.llmKeyId, u);

    const companyAgg = ids.length
      ? await this.billingRepo
          .createQueryBuilder('r')
          .select('r.llmKeyId', 'llmKeyId')
          .addSelect('COUNT(DISTINCT r.companyId)', 'companyCount')
          .where('r.llmKeyId IN (:...ids)', { ids })
          .groupBy('r.llmKeyId')
          .getRawMany<{ llmKeyId: string; companyCount: string }>()
      : [];
    const companyCountMap = new Map<string, number>();
    for (const row of companyAgg) companyCountMap.set(row.llmKeyId, Number(row.companyCount));

    return keys.map((k) => {
      const u = usageMap.get(k.id);
      const usedTodayTokens = u ? Number(u.usedTokens) : 0;
      const dailyQuotaTokens = Number(k.dailyQuotaTokens);
      return {
        id: k.id,
        llmModelId: k.llmModelId ?? null,
        provider: k.provider,
        modelName: k.modelName,
        keyAlias: k.keyAlias,
        isActive: k.isActive,
        dailyQuotaTokens: k.dailyQuotaTokens,
        usedTodayTokens: usedTodayTokens.toString(),
        remainingTokens: Math.max(0, dailyQuotaTokens - usedTodayTokens).toString(),
        assignedCompanyCount: (companyCountMap.get(k.id) ?? 0).toString(),
        lastUsedAt: k.lastUsedAt,
        isBound: boundSet.has(k.id),
      };
    });
  }

  async listKeys(params: {
    provider?: string;
    modelName?: string;
    isActive?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: LlmKeyInfo[]; total: number; page: number; pageSize: number }> {
    const { provider, modelName, isActive, page, pageSize } = params;

    const qb = this.llmKeyRepo.createQueryBuilder('k');
    applyLlmKeyListFilters(qb, { provider, modelName, isActive });

    const total = await qb.clone().getCount();

    const keys = await qb
      .orderBy('k.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const items = await this.buildKeyInfos(keys);

    return { items, total, page, pageSize };
  }

  /** 按 provider + model 分组；筛选条件与 listKeys 一致（忽略分页）。 */
  async listKeysGrouped(params: {
    provider?: string;
    modelName?: string;
    modelType?: 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other';
    isActive?: boolean;
    bindableOnly?: boolean;
    bindableForAgentId?: string;
  }): Promise<{ groups: LlmKeyPoolGroup[]; totalKeys: number }> {
    const maxRows = 5000;
    const { provider, modelName, modelType, isActive, bindableOnly, bindableForAgentId } = params;

    const qbCount = this.llmKeyRepo.createQueryBuilder('k');
    applyLlmKeyListFilters(qbCount, { provider, modelName, isActive });
    const totalKeys = await qbCount.getCount();
    if (totalKeys > maxRows) {
      throw new BadRequestException(
        `Too many LLM keys (${totalKeys}) for grouped view; max ${maxRows}. Narrow provider/model/status filters.`,
      );
    }

    const qb = this.llmKeyRepo.createQueryBuilder('k');
    applyLlmKeyListFilters(qb, { provider, modelName, isActive });

    const keys = await qb
      .orderBy('k.provider', 'ASC')
      .addOrderBy('k.modelName', 'ASC')
      .addOrderBy('k.updatedAt', 'DESC')
      .getMany();

    const infosRaw = await this.buildKeyInfos(keys);
    const modelIds = Array.from(
      new Set(infosRaw.map((i) => (i.llmModelId ?? '').trim()).filter(Boolean)),
    );
    const modelRows = modelIds.length
      ? await this.llmModelRepo.findBy({ id: In(modelIds) as any })
      : [];
    const modelTypeById = new Map<string, string>();
    for (const m of modelRows) modelTypeById.set(m.id, m.modelType);

    const resolveType = (row: LlmKeyInfo): 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other' => {
      const byModel = row.llmModelId ? modelTypeById.get(row.llmModelId) : null;
      if (
        byModel === 'chat' ||
        byModel === 'embedding' ||
        byModel === 'rerank' ||
        byModel === 'image' ||
        byModel === 'audio' ||
        byModel === 'moderation' ||
        byModel === 'other'
      ) {
        return byModel;
      }
      return isEmbeddingLikeByPatterns(row.modelName, this.embeddingPatterns) ? 'embedding' : 'chat';
    };

    const infos = infosRaw.filter((row) => {
      if (!modelType) return true;
      return resolveType(row) === modelType;
    });

    const bindableInfos = await this.filterBindableKeyInfos(infos, {
      bindableOnly,
      bindableForAgentId,
    });

    const providers = await this.llmProviderRepo.find();
    const displayByCode = new Map<string, string>();
    for (const p of providers) displayByCode.set(p.code, p.displayName || p.code);

    const byGroup = new Map<string, LlmKeyInfo[]>();
    for (const row of bindableInfos) {
      const mt = resolveType(row);
      const gk = `${row.provider}\0${mt}\0${row.modelName}`;
      const list = byGroup.get(gk) ?? [];
      list.push(row);
      byGroup.set(gk, list);
    }

    const groups: LlmKeyPoolGroup[] = [];
    for (const [, groupKeys] of byGroup) {
      const first = groupKeys[0]!;
      const prov = String(first.provider);
      const modelType = resolveType(first);
      groups.push({
        provider: prov,
        providerDisplayName: displayByCode.get(prov) ?? prov,
        modelType,
        modelName: first.modelName,
        keyCount: groupKeys.length,
        activeKeyCount: groupKeys.filter((k) => k.isActive).length,
        keys: groupKeys,
      });
    }

    groups.sort((a, b) => {
      const pc = a.provider.localeCompare(b.provider);
      if (pc !== 0) return pc;
      const tc = String(a.modelType ?? 'chat').localeCompare(String(b.modelType ?? 'chat'));
      if (tc !== 0) return tc;
      return a.modelName.localeCompare(b.modelName);
    });

    return { groups, totalKeys: bindableInfos.length };
  }

  /** 绑定 UI 专用：排除已被其他商城 Agent 占用的 Key。 */
  private async filterBindableKeyInfos(
    infos: LlmKeyInfo[],
    opts: { bindableOnly?: boolean; bindableForAgentId?: string },
  ): Promise<LlmKeyInfo[]> {
    const agentId = (opts.bindableForAgentId ?? '').trim();
    if (agentId) {
      const boundIds = infos.filter((k) => k.isBound).map((k) => k.id);
      if (!boundIds.length) return infos;

      const agentByKeyId = new Map<string, string>();
      try {
        const rows = await this.llmKeyRepo.query(
          `select llm_key_id, marketplace_agent_id from marketplace_agent_key_bindings where llm_key_id = any($1::uuid[])`,
          [boundIds],
        );
        for (const r of rows as Array<{ llm_key_id?: string; llmKeyId?: string; marketplace_agent_id?: string; marketplaceAgentId?: string }>) {
          const keyId = (r.llm_key_id ?? r.llmKeyId ?? '').trim();
          const ownerId = (r.marketplace_agent_id ?? r.marketplaceAgentId ?? '').trim();
          if (keyId && ownerId) agentByKeyId.set(keyId, ownerId);
        }
      } catch {
        return infos.filter((k) => !k.isBound);
      }

      return infos.filter((k) => !k.isBound || agentByKeyId.get(k.id) === agentId);
    }

    if (opts.bindableOnly) {
      return infos.filter((k) => !k.isBound);
    }

    return infos;
  }

  /**
   * Admin / 层配置常用「目录短名」（如 glm-4-flash），密钥表登记完整 id（glm-4-flash-250414）。
   * 与 Worker {@link chatPoolKeyModelMatchesRequest} 语义对齐：精确一致，或 `短名 + '-'/ '_'` 前缀扩展。
   */
  private async findChatKeysForAcquireModelName(
    modelName: string,
    allowedProviderCodes: string[],
  ): Promise<LlmKey[]> {
    const exact = await this.llmKeyRepo.find({
      where: {
        provider: In(allowedProviderCodes) as any,
        modelName,
        isActive: true,
      },
      order: { lastUsedAt: 'ASC' } as any,
      take: 100,
    });
    if (exact.length) return exact;

    return this.llmKeyRepo
      .createQueryBuilder('k')
      .where('k.provider IN (:...codes)', { codes: allowedProviderCodes })
      .andWhere('k.is_active = :active', { active: true })
      .andWhere(
        `(
          k.model_name LIKE :pd OR k.model_name LIKE :pu OR
          :mn LIKE k.model_name || '-%' OR :mn LIKE k.model_name || '_%'
        )`,
        {
          pd: `${modelName}-%`,
          pu: `${modelName}_%`,
          mn: modelName,
        },
      )
      .orderBy('k.last_used_at', 'ASC')
      .take(100)
      .getMany();
  }

  async acquire(modelName: string, providerCode?: string): Promise<LlmKeysAcquireResult> {
    this.enforceChatModel(modelName, 'acquire');
    const usageDate = toUsageDateUTC(new Date());

    // 通过 modelName 推导应该走哪类模型路由（避免 gpt-* 与 anthropic provider 错配）
    const n = (modelName || '').toLowerCase();
    const inferredKind: 'openai' | 'anthropic' = n.includes('claude') ? 'anthropic' : 'openai';

    const allowedProviderCodes = providerCode
      ? [providerCode]
      : (await this.llmProviderRepo.find({ where: { kind: inferredKind } })).map((p) => p.code);

    if (!allowedProviderCodes.length) {
      throw new BadRequestException(`No llm providers found for kind=${inferredKind}${providerCode ? `, provider=${providerCode}` : ''}`);
    }

    // MVP：取候选 key 后在应用层过滤剩余配额，避免复杂 join/类型转换
    const candidates = await this.findChatKeysForAcquireModelName(modelName.trim(), allowedProviderCodes);
    if (!candidates.length) {
      throw new BadRequestException(`No active LLM keys for model=${modelName}${providerCode ? `, provider=${providerCode}` : ''}`);
    }

    const candidateIds = candidates.map((c) => c.id);
    const usageRows = await this.dailyUsageRepo.find({
      where: {
        llmKeyId: In(candidateIds),
        usageDate,
      },
    });
    const usageMap = new Map<string, LlmKeyDailyUsage>();
    for (const u of usageRows) usageMap.set(u.llmKeyId, u);

    // daily_quota 仅用于排序与监控，不做硬拒（产品：无限使用 + 池化 failover）
    const ranked = candidates.map((c) => {
      const used = usageMap.get(c.id)?.usedTokens ?? '0';
      const usedNum = Number(used);
      const quotaNum = Number(c.dailyQuotaTokens);
      const pressure =
        quotaNum > 0 ? usedNum / Math.max(quotaNum, 1) : usedNum;
      return {
        key: c,
        usedTodayTokens: usedNum,
        pressure,
      };
    });

    ranked.sort(
      (a, b) =>
        a.pressure - b.pressure ||
        a.usedTodayTokens - b.usedTodayTokens ||
        (a.key.lastUsedAt ? 1 : -1),
    );
    const picked = ranked[0]!;

    // 仅更新 last_used_at，不预占配额；最终实际 usedTokens 由 billing 入账更新（可接受并发下的少量超卖）
    picked.key.lastUsedAt = new Date();
    await this.llmKeyRepo.save(picked.key);

    const decryptedSecret = await this.decryptSecretFromBase64(picked.key.encryptedSecret);

    const provider = await this.resolveProviderByCode(picked.key.provider);
    const defaultRequestUrl =
      inferredKind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';

    const providerUrl = provider?.requestUrl?.trim() ?? '';
    // Safety: never silently route non-OpenAI providers to api.openai.com.
    // This misconfiguration causes long hangs in restricted networks and makes "cmd calls to Ark are fast"
    // look like "SDK is slow", while actually calling the wrong base URL.
    if (inferredKind === 'openai' && picked.key.provider !== 'openai' && !providerUrl) {
      this.logger.error('collab-llm-trace | api.llm_keys.provider_request_url_missing', {
        provider: picked.key.provider,
        modelName: picked.key.modelName,
        llmKeyId: picked.key.id,
      });
      throw new BadRequestException(
        `LLM provider requestUrl missing for provider=${picked.key.provider} (model=${picked.key.modelName}). ` +
          `Refuse to fallback to ${defaultRequestUrl}. Please configure llm_providers.request_url.`,
      );
    }

    const effectiveUrl = providerUrl || defaultRequestUrl;
    const requestPathSuffix = await this.resolveModelRequestPathSuffix({
      llmModelId: picked.key.llmModelId,
      provider: picked.key.provider,
      modelName: picked.key.modelName
    });
    this.logger.log('collab-llm-trace | api.llm_keys.acquire_picked', {
      path: 'acquire',
      llmKeyId: picked.key.id,
      modelName: picked.key.modelName,
      provider: picked.key.provider,
      baseUrl: safeLlmBaseUrlForLogApi(effectiveUrl),
      requestPathSuffix: requestPathSuffix ?? null,
      decryptedSecretLen: decryptedSecret.length,
    });

    const soft = this.quotaSoftSignal(picked.usedTodayTokens, picked.key.dailyQuotaTokens);
    if (soft.warning) {
      this.logger.warn('collab-llm-trace | api.llm_keys.acquire_quota_soft_warning', {
        llmKeyId: picked.key.id,
        modelName: picked.key.modelName,
        remainingQuotaPercent: soft.remainingQuotaPercent,
      });
    }

    return {
      llmKeyId: picked.key.id,
      apiKey: decryptedSecret,
      provider: picked.key.provider,
      providerKind: provider?.kind ?? inferredKind,
      requestUrl: effectiveUrl,
      requestPathSuffix,
      modelName: picked.key.modelName,
      ...soft,
    };
  }

  async acquireById(llmKeyId: string): Promise<LlmKeysAcquireResult> {
    const key = await this.llmKeyRepo.findOne({ where: { id: llmKeyId } });
    if (!key) {
      throw new NotFoundException(`LLM key not found: ${llmKeyId}`);
    }
    if (!key.isActive) {
      throw new BadRequestException(`LLM key is inactive: ${llmKeyId}`);
    }
    this.enforceChatModel(key.modelName, 'acquireById');

    key.lastUsedAt = new Date();
    await this.llmKeyRepo.save(key);

    const decryptedSecret = await this.decryptSecretFromBase64(key.encryptedSecret);

    const inferredKind: 'openai' | 'anthropic' =
      (key.modelName || '').toLowerCase().includes('claude') ? 'anthropic' : 'openai';

    const provider = await this.resolveProviderByCode(key.provider);
    const defaultRequestUrl =
      inferredKind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';

    const providerUrl = provider?.requestUrl?.trim() ?? '';
    if (inferredKind === 'openai' && key.provider !== 'openai' && !providerUrl) {
      this.logger.error('collab-llm-trace | api.llm_keys.provider_request_url_missing', {
        provider: key.provider,
        modelName: key.modelName,
        llmKeyId: key.id,
      });
      throw new BadRequestException(
        `LLM provider requestUrl missing for provider=${key.provider} (model=${key.modelName}). ` +
          `Refuse to fallback to ${defaultRequestUrl}. Please configure llm_providers.request_url.`,
      );
    }

    const effectiveUrlById = providerUrl || defaultRequestUrl;
    const requestPathSuffixById = await this.resolveModelRequestPathSuffix({
      llmModelId: key.llmModelId,
      provider: key.provider,
      modelName: key.modelName
    });
    this.logger.log('collab-llm-trace | api.llm_keys.acquire_picked', {
      path: 'acquireById',
      llmKeyId: key.id,
      modelName: key.modelName,
      provider: key.provider,
      baseUrl: safeLlmBaseUrlForLogApi(effectiveUrlById),
      requestPathSuffix: requestPathSuffixById ?? null,
      decryptedSecretLen: decryptedSecret.length,
    });

    const usageDateById = toUsageDateUTC(new Date());
    const usageRowById = await this.dailyUsageRepo.findOne({
      where: { llmKeyId: key.id, usageDate: usageDateById },
    });
    const usedTodayById = usageRowById ? Number(usageRowById.usedTokens) : 0;
    const softById = this.quotaSoftSignal(usedTodayById, key.dailyQuotaTokens);
    if (softById.warning) {
      this.logger.warn('collab-llm-trace | api.llm_keys.acquire_by_id_quota_soft_warning', {
        llmKeyId: key.id,
        modelName: key.modelName,
        remainingQuotaPercent: softById.remainingQuotaPercent,
      });
    }

    return {
      llmKeyId: key.id,
      apiKey: decryptedSecret,
      provider: key.provider,
      providerKind: provider?.kind ?? inferredKind,
      requestUrl: effectiveUrlById,
      requestPathSuffix: requestPathSuffixById,
      modelName: key.modelName,
      ...softById,
    };
  }

  /** 过滤出仍存在于 `llm_keys` 且 active 的 chat Key（排除 embedding 类模型）。 */
  async filterExistingActiveChatKeyIds(keyIds: string[]): Promise<string[]> {
    const uniq = [...new Set(keyIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!uniq.length) return [];
    const rows = await this.llmKeyRepo.find({
      where: { id: In(uniq), isActive: true },
      select: ['id', 'modelName'],
    });
    return rows
      .filter((k) => !isEmbeddingLikeByPatterns(k.modelName, this.embeddingPatterns))
      .map((k) => k.id);
  }

  /** 运行时校验 CEO 层配置 / 商城模板中的 keyIds 引用。 */
  async loadActiveChatKeyIdSet(): Promise<Set<string>> {
    const rows = await this.llmKeyRepo.find({
      where: { isActive: true },
      select: ['id', 'modelName'],
    });
    return new Set(
      rows
        .filter((k) => !isEmbeddingLikeByPatterns(k.modelName, this.embeddingPatterns))
        .map((k) => k.id),
    );
  }

  async getKeyById(id: string): Promise<LlmKeyInfo> {
    const key = await this.llmKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`LLM key not found: ${id}`);

    const usageDate = toUsageDateUTC(new Date());
    const u = await this.dailyUsageRepo.findOne({ where: { llmKeyId: key.id, usageDate } });

    const usedTodayTokens = u ? Number(u.usedTokens) : 0;
    const dailyQuotaTokens = Number(key.dailyQuotaTokens);

    const companyCountAgg = await this.billingRepo
      .createQueryBuilder('r')
      .select('COUNT(DISTINCT r.companyId)', 'companyCount')
      .where('r.llmKeyId = :id', { id })
      .getRawOne<{ companyCount: string }>();

    return {
      id: key.id,
      provider: key.provider,
      modelName: key.modelName,
      keyAlias: key.keyAlias,
      isActive: key.isActive,
      dailyQuotaTokens: key.dailyQuotaTokens,
      usedTodayTokens: usedTodayTokens.toString(),
      remainingTokens: Math.max(0, dailyQuotaTokens - usedTodayTokens).toString(),
      assignedCompanyCount: (companyCountAgg?.companyCount ?? 0).toString(),
      lastUsedAt: key.lastUsedAt,
    };
  }

  async createKey(input: {
    llmModelId?: string;
    provider: string;
    modelName: string;
    keyAlias: string;
    secret: string;
    dailyQuotaTokens: number;
    isActive?: boolean;
  }): Promise<LlmKeyInfo> {
    let provider = input.provider;
    let modelName = input.modelName;
    let llmModelId: string | null = null;
    if (input.llmModelId?.trim()) {
      const model = await this.llmModelRepo.findOne({ where: { id: input.llmModelId.trim() } });
      if (!model) throw new BadRequestException(`LLM model not found: ${input.llmModelId}`);
      provider = model.providerCode;
      modelName = model.modelName;
      llmModelId = model.id;
    }

    const encryptedSecret = await this.encryptSecretToBase64(input.secret);
    const row = this.llmKeyRepo.create({
      llmModelId,
      provider: provider as any,
      modelName,
      keyAlias: input.keyAlias,
      encryptedSecret,
      dailyQuotaTokens: String(input.dailyQuotaTokens),
      isActive: input.isActive ?? true,
    });
    const saved = await this.llmKeyRepo.save(row);
    return {
      id: saved.id,
      llmModelId: saved.llmModelId ?? null,
      provider: saved.provider,
      modelName: saved.modelName,
      keyAlias: saved.keyAlias,
      isActive: saved.isActive,
      dailyQuotaTokens: saved.dailyQuotaTokens,
      usedTodayTokens: '0',
      remainingTokens: saved.dailyQuotaTokens,
      assignedCompanyCount: '0',
      lastUsedAt: saved.lastUsedAt,
    };
  }

  async updateKey(id: string, patch: { dailyQuotaTokens?: number; isActive?: boolean; keyAlias?: string }): Promise<LlmKeyInfo> {
    const key = await this.llmKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`LLM key not found: ${id}`);

    if (patch.dailyQuotaTokens !== undefined) key.dailyQuotaTokens = String(patch.dailyQuotaTokens);
    if (patch.isActive !== undefined) key.isActive = patch.isActive;
    if (patch.keyAlias !== undefined) key.keyAlias = patch.keyAlias;

    await this.llmKeyRepo.save(key);
    return this.getKeyById(id);
  }

  async rotateKey(id: string, secret: string): Promise<LlmKeyInfo> {
    const key = await this.llmKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`LLM key not found: ${id}`);

    key.encryptedSecret = await this.encryptSecretToBase64(secret);
    await this.llmKeyRepo.save(key);
    return this.getKeyById(id);
  }

  async disableKey(id: string): Promise<LlmKeyInfo> {
    return this.updateKey(id, { isActive: false });
  }

  async enableKey(id: string): Promise<LlmKeyInfo> {
    return this.updateKey(id, { isActive: true });
  }

  async removeKey(id: string): Promise<void> {
    await this.llmKeyRepo.manager.transaction(async (em) => {
      await em.delete(MarketplaceAgentKeyBinding, { llmKeyId: id });
      await em
        .createQueryBuilder()
        .update(CompanyMarketplaceAgentKeyAssignment)
        .set({ preferredLlmKeyId: null })
        .where('preferred_llm_key_id = :id', { id })
        .execute();
      await em
        .createQueryBuilder()
        .update(CompanyMarketplaceAgentKeyAssignment)
        .set({ assignedLlmKeyId: null })
        .where('assigned_llm_key_id = :id', { id })
        .execute();
      await em.update(BillingSettings, { ceoDecisionLlmKeyId: id }, { ceoDecisionLlmKeyId: null });
      await em.delete(LlmKey, { id });
    });
  }

  async importKeys(items: Array<{
    provider: string;
    modelName: string;
    keyAlias: string;
    secret: string;
    dailyQuotaTokens: number;
    isActive?: boolean;
  }>): Promise<LlmKeyInfo[]> {
    // 顺序导入，避免在同一 keyAlias/provider/model 上发生重复约束时并发冲突更难定位。
    const out: LlmKeyInfo[] = [];
    for (const item of items) {
      out.push(
        await this.createKey({
          provider: item.provider,
          modelName: item.modelName,
          keyAlias: item.keyAlias,
          secret: item.secret,
          dailyQuotaTokens: item.dailyQuotaTokens,
          isActive: item.isActive,
        }),
      );
    }
    return out;
  }

  async testKeyConnection(input: {
    llmModelId?: string;
    provider: string;
    modelName: string;
    secret: string;
  }): Promise<{
    ok: boolean;
    provider: string;
    modelName: string;
    requestUrl: string;
    endpoint: string;
    httpStatus?: number;
    message: string;
  }> {
    const providerCode = input.provider.trim();
    const modelName = input.modelName.trim();
    const secret = input.secret.trim();
    if (!providerCode) throw new BadRequestException('Provider is required');
    if (!modelName) throw new BadRequestException('Model name is required');
    if (!secret) throw new BadRequestException('Secret is required');

    const provider = await this.resolveProviderByCode(providerCode);
    if (!provider) throw new BadRequestException(`LLM provider not found: ${providerCode}`);
    const requestUrl = provider.requestUrl?.trim();
    if (!requestUrl) {
      throw new BadRequestException(`LLM provider requestUrl missing: ${providerCode}`);
    }

    const requestPathSuffix = await this.resolveModelRequestPathSuffix({
      llmModelId: input.llmModelId,
      provider: providerCode,
      modelName,
    });
    const endpoint = requestPathSuffix?.trim() || '/chat/completions';
    const baseUrl = requestUrl.replace(/\/$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${baseUrl}${normalizedEndpoint}`;

    const probePlans = normalizedEndpoint.toLowerCase().includes('/embeddings')
      ? this.buildEmbeddingProbePlans(baseUrl, normalizedEndpoint, modelName)
      : [{ url: targetUrl, body: this.buildChatProbeBody(modelName) }];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      let lastStatus: number | undefined;
      let lastText = '';
      for (const { url, body } of probePlans) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        if (response.ok) {
          if (normalizedEndpoint.toLowerCase().includes('/embeddings')) {
            const parsed = parseEmbeddingConnectivityResponse(text);
            if (parsed.ok === false) {
              lastStatus = response.status;
              lastText = `${parsed.reason}: ${text.slice(0, 240)}`;
              continue;
            }
            return {
              ok: true,
              provider: providerCode,
              modelName,
              requestUrl: baseUrl,
              endpoint: normalizedEndpoint,
              httpStatus: response.status,
              message: `Key is valid (HTTP ${response.status}, embedding ${parsed.dimensions} dimensions).`,
            };
          }
          return {
            ok: true,
            provider: providerCode,
            modelName,
            requestUrl: baseUrl,
            endpoint: normalizedEndpoint,
            httpStatus: response.status,
            message: `Key is valid (HTTP ${response.status}).`,
          };
        }
        lastStatus = response.status;
        lastText = text;
      }
      const shortError = lastText ? lastText.slice(0, 240) : `HTTP ${lastStatus ?? 0}`;
      return {
        ok: false,
        provider: providerCode,
        modelName,
        requestUrl: baseUrl,
        endpoint: normalizedEndpoint,
        httpStatus: lastStatus,
        message: `Key test failed: ${shortError}`,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        provider: providerCode,
        modelName,
        requestUrl: baseUrl,
        endpoint: normalizedEndpoint,
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildChatProbeBody(modelName: string): Record<string, unknown> {
    return { model: modelName, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 };
  }

  /**
   * 与 {@link EmbeddingResolverService} 对齐的探针体；多模态**配置**下必须命中配置的 `/embeddings/multimodal` 并成功解析向量，
   * 避免仅 `/embeddings` 返回 200 即误判（运行时仍可能在该模型上 multimodal 失败而被标 unhealthy）。
   */
  private buildEmbeddingProbePlans(
    baseUrl: string,
    endpoint: string,
    modelName: string,
  ): Array<{ url: string; body: Record<string, unknown> }> {
    const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const lower = ep.toLowerCase();
    const root = baseUrl.replace(/\/$/, '');
    const targetUrl = `${root}${ep}`;
    const enc = { encoding_format: 'float' };
    const probe = EMBEDDING_CONNECTIVITY_PROBE_TEXT;
    if (lower.includes('/embeddings/multimodal')) {
      const shortProbe = '短文本多模态探针 / Short multimodal embedding probe.';
      return [
        { url: targetUrl, body: { model: modelName, input: [{ type: 'text', text: probe }], ...enc } },
        { url: targetUrl, body: { model: modelName, input: [{ type: 'text', text: shortProbe }], ...enc } },
      ];
    }
    const plans: Array<{ url: string; body: Record<string, unknown> }> = [
      { url: targetUrl, body: { model: modelName, input: probe, ...enc } },
      { url: targetUrl, body: { model: modelName, input: [probe], ...enc } },
    ];
    if (!embeddingsPathExpectsStringInputOnly(targetUrl)) {
      plans.push({ url: targetUrl, body: { model: modelName, input: [{ type: 'text', text: probe }], ...enc } });
    }
    return plans;
  }

  async testKeyConnectionById(id: string): Promise<{
    ok: boolean;
    provider: string;
    modelName: string;
    requestUrl: string;
    endpoint: string;
    httpStatus?: number;
    message: string;
  }> {
    const key = await this.llmKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`LLM key not found: ${id}`);
    const secret = await this.decryptSecretFromBase64(key.encryptedSecret);
    return await this.testKeyConnection({
      llmModelId: key.llmModelId ?? undefined,
      provider: key.provider,
      modelName: key.modelName,
      secret,
    });
  }

  /**
   * 管理端商城模板试调用：使用指定 Key 走与运行时一致的 OpenAI-compat Chat Completions。
   */
  async invokeChatWithKeyId(params: {
    llmKeyId: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    content: string;
    modelName: string;
    provider: string;
    keyAlias: string;
    requestUrl: string;
    httpStatus: number;
    requestEndpoint: string;
    requestBody: Record<string, unknown>;
    rawResponse: unknown;
    upstreamDurationMs: number;
  }> {
    const keyRow = await this.llmKeyRepo.findOne({ where: { id: params.llmKeyId } });
    if (!keyRow) {
      throw new NotFoundException(`LLM key not found: ${params.llmKeyId}`);
    }

    const acquired = await this.acquireById(params.llmKeyId);
    const baseUrl = acquired.requestUrl.replace(/\/$/, '');
    const suffix = acquired.requestPathSuffix?.trim() || '/chat/completions';
    const endpoint = suffix.startsWith('/') ? suffix : `/${suffix}`;
    const targetUrl = `${baseUrl}${endpoint}`;

    const requestBody = {
      model: acquired.modelName,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.3,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const upstreamStarted = Date.now();
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${acquired.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const upstreamDurationMs = Date.now() - upstreamStarted;
      const text = await response.text();
      let rawResponse: unknown = text;
      try {
        rawResponse = JSON.parse(text) as unknown;
      } catch {
        // keep raw text for debug when provider returns non-JSON
      }
      if (!response.ok) {
        throw new BadRequestException(
          `LLM 调用失败 HTTP ${response.status}: ${text.slice(0, 800)}`,
        );
      }
      let json: { choices?: { message?: { content?: string } }[] };
      if (typeof rawResponse === 'object' && rawResponse !== null) {
        json = rawResponse as { choices?: { message?: { content?: string } }[] };
      } else {
        throw new BadRequestException('LLM 返回非 JSON 响应');
      }
      const content = json?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) {
        throw new BadRequestException('LLM 返回内容为空');
      }
      return {
        content,
        modelName: acquired.modelName,
        provider: acquired.provider,
        keyAlias: keyRow.keyAlias,
        requestUrl: baseUrl,
        httpStatus: response.status,
        requestEndpoint: targetUrl,
        requestBody,
        rawResponse,
        upstreamDurationMs,
      };
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`LLM 调用异常: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

