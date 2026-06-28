import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { inferEmbeddingDimensionsFromModelName } from '../../common/llm/volc-embedding-input.util.js';
import { SecurityService } from '../../common/security/security.service.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';

export type EmbeddingModelInfo = {
  id: string;
  modelName: string;
  provider: string;
  dimensions: number;
  requestUrl: string | null;
  isActive: boolean;
  hasSecret: boolean;
};

export type EmbeddingAcquireCredentials = {
  embeddingModelId: string;
  modelName: string;
  provider: string;
  /** 本次选用的活跃密钥行（计费/审计溯源）；无密钥时为 null */
  llmKeyId: string | null;
  /** 库中显式维度；null 表示未知，校验与 Ark dimensions 参数由池侧 expectedDimensions 承担 */
  dimensions: number | null;
  /** 池未配置密钥时为空，调用方走伪向量或降级 */
  apiKey: string | null;
  requestUrl: string; // base url (provider)
  endpointUrl: string; // base + suffix
};

@Injectable()
export class EmbeddingModelsService {
  constructor(
    @InjectRepository(LlmModel)
    private readonly llmModelRepo: Repository<LlmModel>,
    @InjectRepository(LlmProvider)
    private readonly llmProviderRepo: Repository<LlmProvider>,
    @InjectRepository(LlmKey)
    private readonly llmKeyRepo: Repository<LlmKey>,
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

  async decryptSecretFromBase64(encryptedBase64: string | null | undefined): Promise<string | null> {
    if (!encryptedBase64?.trim()) return null;
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
    return plain.trim() || null;
  }

  async listModels(params: {
    isActive?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: EmbeddingModelInfo[]; total: number }> {
    const page = Math.max(1, params.page);
    const pageSize = Math.min(100, Math.max(1, params.pageSize));
    const qb = this.llmModelRepo
      .createQueryBuilder('m')
      .where(`m.model_type = 'embedding'`);
    if (params.isActive !== undefined) {
      qb.andWhere('m.is_active = :isActive', { isActive: params.isActive });
    }
    const total = await qb.clone().getCount();
    qb.orderBy('m.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const rows = await qb.getMany();
    const providerCodes = Array.from(new Set(rows.map((r) => r.providerCode)));
    const providers = providerCodes.length
      ? await this.llmProviderRepo.findBy(providerCodes.map((c) => ({ code: c })) as any)
      : [];
    const providerMap = new Map<string, LlmProvider>();
    for (const p of providers) providerMap.set(p.code, p);
    const ids = rows.map((r) => r.id);
    const keys = ids.length
      ? await this.llmKeyRepo
          .createQueryBuilder('k')
          .where('k.llm_model_id IN (:...ids)', { ids })
          .andWhere('k.is_active = true')
          .getMany()
      : [];
    const hasSecretByModel = new Map<string, boolean>();
    for (const k of keys) {
      if (k.encryptedSecret?.trim()) hasSecretByModel.set(k.llmModelId ?? '', true);
    }
    return {
      total,
      items: rows.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        provider: m.providerCode,
        dimensions:
          m.embeddingDimensions ??
          (/\bembedding-vision\b/i.test(m.modelName ?? '') ? 2048 : 1536),
        requestUrl: providerMap.get(m.providerCode)?.requestUrl ?? null,
        isActive: m.isActive,
        hasSecret: hasSecretByModel.get(m.id) ?? false,
      })),
    };
  }

  async createModel(input: {
    modelName: string;
    provider: string;
    dimensions: number;
    secret?: string | null;
    requestUrl?: string | null;
    isActive?: boolean;
    maxBatchSize?: number | null;
  }): Promise<EmbeddingModelInfo> {
    const providerCode = (input.provider || 'openai').trim();
    const provider = await this.llmProviderRepo.findOne({ where: { code: providerCode } });
    if (!provider) throw new BadRequestException(`LLM provider not found: ${providerCode}`);
    const row = this.llmModelRepo.create({
      providerCode,
      modelName: input.modelName.trim(),
      modelType: 'embedding',
      requestPathSuffix: input.requestUrl?.trim() || '/embeddings',
      isActive: input.isActive ?? true,
      embeddingDimensions: Number.isFinite(input.dimensions) && input.dimensions > 0 ? Math.floor(input.dimensions) : null,
    });
    const saved = await this.llmModelRepo.save(row);
    if (input.secret?.trim()) {
      const encryptedSecret = await this.encryptSecretToBase64(input.secret.trim());
      const alias = `emb-${Date.now()}`;
      await this.llmKeyRepo.save(
        this.llmKeyRepo.create({
          llmModelId: saved.id,
          provider: providerCode,
          modelName: saved.modelName,
          keyAlias: alias,
          encryptedSecret,
          dailyQuotaTokens: '0',
          isActive: true,
        }),
      );
    }
    return {
      id: saved.id,
      modelName: saved.modelName,
      provider: saved.providerCode,
      dimensions: input.dimensions,
      requestUrl: provider.requestUrl ?? null,
      isActive: saved.isActive,
      hasSecret: Boolean(input.secret?.trim()),
    };
  }

  async updateModel(
    id: string,
    patch: {
      dimensions?: number;
      isActive?: boolean;
      requestUrl?: string | null;
      maxBatchSize?: number | null;
    },
  ): Promise<EmbeddingModelInfo> {
    const m = await this.llmModelRepo.findOne({ where: { id, modelType: 'embedding' as any } });
    if (!m) throw new NotFoundException(`Embedding model not found: ${id}`);
    if (patch.isActive !== undefined) m.isActive = patch.isActive;
    if (patch.requestUrl !== undefined) m.requestPathSuffix = patch.requestUrl?.trim() || null;
    if (patch.dimensions !== undefined) {
      m.embeddingDimensions =
        Number.isFinite(patch.dimensions) && patch.dimensions > 0 ? Math.floor(patch.dimensions) : null;
    }
    await this.llmModelRepo.save(m);
    const provider = await this.llmProviderRepo.findOne({ where: { code: m.providerCode } });
    const hasSecret = await this.llmKeyRepo.exist({
      where: {
        llmModelId: m.id,
        isActive: true,
      } as any,
    });
    return {
      id: m.id,
      modelName: m.modelName,
      provider: m.providerCode,
      dimensions: m.embeddingDimensions ?? 1536,
      requestUrl: provider?.requestUrl ?? null,
      isActive: m.isActive,
      hasSecret,
    };
  }

  async rotateSecret(id: string, secret: string): Promise<EmbeddingModelInfo> {
    const m = await this.llmModelRepo.findOne({ where: { id, modelType: 'embedding' as any } });
    if (!m) throw new NotFoundException(`Embedding model not found: ${id}`);
    const encryptedSecret = await this.encryptSecretToBase64(secret.trim());
    const existing = await this.llmKeyRepo.findOne({
      where: { llmModelId: m.id, isActive: true } as any,
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      existing.encryptedSecret = encryptedSecret;
      await this.llmKeyRepo.save(existing);
    } else {
      const alias = `emb-${Date.now()}`;
      await this.llmKeyRepo.save(
        this.llmKeyRepo.create({
          llmModelId: m.id,
          provider: m.providerCode,
          modelName: m.modelName,
          keyAlias: alias,
          encryptedSecret,
          dailyQuotaTokens: '0',
          isActive: true,
        }),
      );
    }
    const provider = await this.llmProviderRepo.findOne({ where: { code: m.providerCode } });
    return {
      id: m.id,
      modelName: m.modelName,
      provider: m.providerCode,
      dimensions: m.embeddingDimensions ?? 1536,
      requestUrl: provider?.requestUrl ?? null,
      isActive: m.isActive,
      hasSecret: true,
    };
  }

  async removeModel(id: string): Promise<void> {
    const used = await this.llmModelRepo.manager.query(
      `select count(*)::int as c from marketplace_agent_key_bindings where embedding_model_id = $1`,
      [id],
    );
    if (Array.isArray(used) && Number(used[0]?.c) > 0) {
      throw new BadRequestException('该 Embedding 仍被商城绑定引用，无法删除');
    }
    await this.llmKeyRepo.delete({ llmModelId: id } as any);
    await this.llmModelRepo.delete({ id } as any);
  }

  /**
   * 运行时解析：供 Memory EmbeddingService 进程内调用（不做 admin 鉴权）。
   */
  async acquireCredentials(embeddingModelId: string): Promise<EmbeddingAcquireCredentials> {
    // 优先走统一模型池（llm_models + llm_keys）
    const merged = await this.llmModelRepo.findOne({ where: { id: embeddingModelId } as any });
    if (merged && merged.modelType === 'embedding') {
      if (!merged.isActive) {
        throw new BadRequestException(`Embedding model inactive: ${embeddingModelId}`);
      }
      const provider = await this.llmProviderRepo.findOne({ where: { code: merged.providerCode } });
      if (!provider?.requestUrl?.trim()) {
        throw new BadRequestException(`Provider base URL missing for embedding model: ${embeddingModelId}`);
      }
      const key = await this.llmKeyRepo.findOne({
        where: { llmModelId: merged.id, isActive: true } as any,
        order: { updatedAt: 'DESC' },
      });
      const apiKey = await this.decryptSecretFromBase64(key?.encryptedSecret ?? null);
      const base = provider.requestUrl.trim().replace(/\/$/, '');
      const suffix = (merged.requestPathSuffix?.trim() || '/embeddings').replace(/^([^/])/, '/$1');
      const rawDim = merged.embeddingDimensions;
      const dimOut =
        typeof rawDim === 'number' && Number.isFinite(rawDim) && rawDim > 0
          ? Math.floor(rawDim)
          : inferEmbeddingDimensionsFromModelName(merged.modelName ?? '');
      return {
        embeddingModelId: merged.id,
        modelName: merged.modelName,
        provider: merged.providerCode,
        llmKeyId: key?.id ?? null,
        dimensions: dimOut,
        apiKey,
        requestUrl: base,
        endpointUrl: `${base}${suffix}`,
      };
    }

    throw new BadRequestException(`Embedding model not found: ${embeddingModelId}`);
  }

  /** 仅读维度，不解密密钥；供 Memory 路径在 embed 前对齐期望长度 */
  async getEmbeddingDimensionsForLlmModel(modelId: string): Promise<number | null> {
    const m = await this.llmModelRepo.findOne({
      where: { id: modelId, modelType: 'embedding' as any },
      select: ['id', 'embeddingDimensions', 'modelName'],
    });
    const d = m?.embeddingDimensions;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) return Math.floor(d);
    return inferEmbeddingDimensionsFromModelName(m?.modelName ?? '');
  }
}
