import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { SecurityService } from '../../common/security/security.service.js';
import { LlmKey } from './entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from './entities/llm-key-daily-usage.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { BillingRecord } from '../billing/entities/billing-record.entity.js';
import type { LlmKeyInfo, LlmKeysAcquireResult } from './interfaces/llm-key.interface.js';

function toUsageDateUTC(d: Date): string {
  // 使用 UTC 日期，避免跨时区导致“今日”定义漂移
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

@Injectable()
export class LlmKeysService {
  private readonly logger = new Logger(LlmKeysService.name);

  constructor(
    @InjectRepository(LlmKey)
    private readonly llmKeyRepo: Repository<LlmKey>,
    @InjectRepository(LlmKeyDailyUsage)
    private readonly dailyUsageRepo: Repository<LlmKeyDailyUsage>,
    @InjectRepository(LlmProvider)
    private readonly llmProviderRepo: Repository<LlmProvider>,
    @InjectRepository(BillingRecord)
    private readonly billingRepo: Repository<BillingRecord>,
    private readonly securityService: SecurityService,
  ) {}

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

  async listKeys(params: {
    provider?: string;
    modelName?: string;
    isActive?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: LlmKeyInfo[]; total: number; page: number; pageSize: number }> {
    const { provider, modelName, isActive, page, pageSize } = params;
    const usageDate = toUsageDateUTC(new Date());

    const qb = this.llmKeyRepo.createQueryBuilder('k');
    if (provider) qb.andWhere('k.provider = :provider', { provider });
    if (modelName) qb.andWhere('k.modelName = :modelName', { modelName });
    if (isActive !== undefined) qb.andWhere('k.isActive = :isActive', { isActive });

    const total = await qb.clone().getCount();

    const keys = await qb
      .orderBy('k.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = keys.map((k) => k.id);

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

    const items: LlmKeyInfo[] = keys.map((k) => {
      const u = usageMap.get(k.id);
      const usedTodayTokens = u ? Number(u.usedTokens) : 0;
      const dailyQuotaTokens = Number(k.dailyQuotaTokens);
      return {
        id: k.id,
        provider: k.provider,
        modelName: k.modelName,
        keyAlias: k.keyAlias,
        isActive: k.isActive,
        dailyQuotaTokens: k.dailyQuotaTokens,
        usedTodayTokens: usedTodayTokens.toString(),
        remainingTokens: Math.max(0, dailyQuotaTokens - usedTodayTokens).toString(),
        assignedCompanyCount: (companyCountMap.get(k.id) ?? 0).toString(),
        lastUsedAt: k.lastUsedAt,
      };
    });

    return { items, total, page, pageSize };
  }

  async acquire(modelName: string, providerCode?: string): Promise<LlmKeysAcquireResult> {
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
    const candidates = await this.llmKeyRepo.find({
      where: {
        provider: In(allowedProviderCodes) as any,
        modelName,
        isActive: true,
      },
      order: {
        // 倾向选择最近未使用或已使用量更少的 key（精确排序在过滤后做）
        lastUsedAt: 'ASC',
      } as any,
      take: 100,
    });
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

    const eligible = candidates
      .map((c) => {
        const used = usageMap.get(c.id)?.usedTokens ?? '0';
        const usedNum = Number(used);
        const quotaNum = Number(c.dailyQuotaTokens);
        return {
          key: c,
          usedTodayTokens: usedNum,
          remaining: quotaNum - usedNum,
        };
      })
      .filter((x) => x.remaining > 0);

    if (!eligible.length) {
      throw new BadRequestException(
        `All LLM keys are exhausted today for model=${modelName}${providerCode ? `, provider=${providerCode}` : ''}`,
      );
    }

    eligible.sort((a, b) => a.usedTodayTokens - b.usedTodayTokens || (a.key.lastUsedAt ? 1 : -1));
    const picked = eligible[0]!;

    // 仅更新 last_used_at，不预占配额；最终实际 usedTokens 由 billing 入账更新（可接受并发下的少量超卖）
    picked.key.lastUsedAt = new Date();
    await this.llmKeyRepo.save(picked.key);

    const decryptedSecret = await this.decryptSecretFromBase64(picked.key.encryptedSecret);

    const provider = await this.llmProviderRepo.findOne({ where: { code: picked.key.provider } });
    const defaultRequestUrl = inferredKind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';

    const effectiveUrl = provider?.requestUrl ?? defaultRequestUrl;
    this.logger.log('collab-llm-trace | api.llm_keys.acquire_picked', {
      path: 'acquire',
      llmKeyId: picked.key.id,
      modelName: picked.key.modelName,
      provider: picked.key.provider,
      baseUrl: safeLlmBaseUrlForLogApi(effectiveUrl),
      decryptedSecretLen: decryptedSecret.length,
    });

    return {
      llmKeyId: picked.key.id,
      apiKey: decryptedSecret,
      provider: picked.key.provider,
      providerKind: provider?.kind ?? inferredKind,
      requestUrl: effectiveUrl,
      modelName: picked.key.modelName,
    };
  }

  async acquireById(llmKeyId: string): Promise<LlmKeysAcquireResult> {
    const usageDate = toUsageDateUTC(new Date());

    const key = await this.llmKeyRepo.findOne({ where: { id: llmKeyId } });
    if (!key) {
      throw new NotFoundException(`LLM key not found: ${llmKeyId}`);
    }
    if (!key.isActive) {
      throw new BadRequestException(`LLM key is inactive: ${llmKeyId}`);
    }

    const u = await this.dailyUsageRepo.findOne({
      where: {
        llmKeyId,
        usageDate,
      },
    });
    const usedTodayTokens = u ? Number(u.usedTokens) : 0;
    const dailyQuotaTokens = Number(key.dailyQuotaTokens);
    const remaining = dailyQuotaTokens - usedTodayTokens;
    if (remaining <= 0) {
      throw new BadRequestException(`LLM key is exhausted today: ${llmKeyId}`);
    }

    key.lastUsedAt = new Date();
    await this.llmKeyRepo.save(key);

    const decryptedSecret = await this.decryptSecretFromBase64(key.encryptedSecret);

    const inferredKind: 'openai' | 'anthropic' =
      (key.modelName || '').toLowerCase().includes('claude') ? 'anthropic' : 'openai';

    const provider = await this.llmProviderRepo.findOne({ where: { code: key.provider } });
    const defaultRequestUrl =
      inferredKind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';

    const effectiveUrlById = provider?.requestUrl ?? defaultRequestUrl;
    this.logger.log('collab-llm-trace | api.llm_keys.acquire_picked', {
      path: 'acquireById',
      llmKeyId: key.id,
      modelName: key.modelName,
      provider: key.provider,
      baseUrl: safeLlmBaseUrlForLogApi(effectiveUrlById),
      decryptedSecretLen: decryptedSecret.length,
    });

    return {
      llmKeyId: key.id,
      apiKey: decryptedSecret,
      provider: key.provider,
      providerKind: provider?.kind ?? inferredKind,
      requestUrl: effectiveUrlById,
      modelName: key.modelName,
    };
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
    provider: string;
    modelName: string;
    keyAlias: string;
    secret: string;
    dailyQuotaTokens: number;
    isActive?: boolean;
  }): Promise<LlmKeyInfo> {
    const encryptedSecret = await this.encryptSecretToBase64(input.secret);
    const row = this.llmKeyRepo.create({
      provider: input.provider as any,
      modelName: input.modelName,
      keyAlias: input.keyAlias,
      encryptedSecret,
      dailyQuotaTokens: String(input.dailyQuotaTokens),
      isActive: input.isActive ?? true,
    });
    const saved = await this.llmKeyRepo.save(row);
    return {
      id: saved.id,
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
    const key = await this.llmKeyRepo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`LLM key not found: ${id}`);
    await this.llmKeyRepo.delete(id);
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
}

