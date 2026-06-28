import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BillingService } from '../billing/services/billing.service.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import type { LlmModelCatalogPricing, LlmModelInfo } from './interfaces/llm-model.interface.js';
import { LlmModel, type LlmModelType } from './entities/llm-model.entity.js';
import type { CreateLlmModelDto } from './dto/create-llm-model.dto.js';
import type { UpdateLlmModelDto } from './dto/update-llm-model.dto.js';

function normSuffix(s: string | null | undefined): string | null {
  const v = s?.trim() ?? '';
  if (!v) return null;
  return v.startsWith('/') ? v : `/${v}`;
}

function inferEmbeddingDimensions(
  modelType: LlmModelType,
  modelName: string,
  explicit?: number | null,
): number | null {
  if (modelType !== 'embedding') return null;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 256 && explicit <= 8192) {
    return Math.floor(explicit);
  }
  if (/\bembedding-vision\b/i.test(modelName)) return 2048;
  return null;
}

function toModelInfo(m: LlmModel, catalog: LlmModelCatalogPricing | null | undefined): LlmModelInfo {
  return {
    id: m.id,
    providerCode: m.providerCode,
    modelName: m.modelName,
    modelType: m.modelType,
    requestPathSuffix: m.requestPathSuffix,
    embeddingDimensions: m.embeddingDimensions ?? null,
    isActive: m.isActive,
    catalogPricing: catalog ?? null,
  };
}

@Injectable()
export class LlmModelsService {
  constructor(
    @InjectRepository(LlmModel)
    private readonly repo: Repository<LlmModel>,
    @InjectRepository(LlmProvider)
    private readonly providersRepo: Repository<LlmProvider>,
    private readonly billing: BillingService,
  ) {}

  /**
   * 将 Admin 填写的定价写入平台 `model_pricing`（company_id IS NULL），与任意 Agent 绑定后的 LLM 入账价源一致。
   */
  private async syncPlatformCatalogPricing(
    llmModelId: string,
    modelName: string,
    modelType: LlmModelType,
    prices: { inputPricePerMillion: number; outputPricePerMillion: number; embeddingPricePerMillion: number },
  ): Promise<void> {
    const name = String(modelName ?? '').trim();
    if (!name) return;
    if (modelType === 'embedding') {
      await this.billing.upsertPlatformCatalogModelPricing({
        modelName: name,
        llmModelId,
        inputPricePerMillion: '0',
        outputPricePerMillion: '0',
        embeddingPricePerMillion: String(prices.embeddingPricePerMillion),
        currency: 'CREDIT',
      });
      return;
    }
    await this.billing.upsertPlatformCatalogModelPricing({
      modelName: name,
      llmModelId,
      inputPricePerMillion: String(prices.inputPricePerMillion),
      outputPricePerMillion: String(prices.outputPricePerMillion),
      embeddingPricePerMillion: String(prices.embeddingPricePerMillion),
      currency: 'CREDIT',
    });
  }

  async list(params?: { providerCode?: string; modelType?: LlmModelType; isActive?: boolean }): Promise<LlmModelInfo[]> {
    const qb = this.repo.createQueryBuilder('m');
    if (params?.providerCode?.trim()) {
      qb.andWhere('m.provider_code = :providerCode', { providerCode: params.providerCode.trim() });
    }
    if (params?.modelType) {
      qb.andWhere('m.model_type = :modelType', { modelType: params.modelType });
    }
    if (params?.isActive !== undefined) {
      qb.andWhere('m.is_active = :isActive', { isActive: params.isActive });
    }
    qb.orderBy('m.provider_code', 'ASC').addOrderBy('m.model_type', 'ASC').addOrderBy('m.model_name', 'ASC');
    const rows = await qb.getMany();
    const byId = await this.billing.getActivePlatformCatalogPricingByLlmModelIds(rows.map((r) => r.id));
    const missingNames = [
      ...new Set(
        rows.filter((m) => !byId.has(m.id)).map((m) => String(m.modelName ?? '').trim()).filter(Boolean),
      ),
    ];
    const priceMap =
      missingNames.length > 0
        ? await this.billing.getActivePlatformCatalogPricingByModelNames(missingNames)
        : new Map<string, LlmModelCatalogPricing>();
    return rows.map((m) => toModelInfo(m, byId.get(m.id) ?? priceMap.get(m.modelName) ?? null));
  }

  async create(input: CreateLlmModelDto): Promise<LlmModelInfo> {
    const providerCode = input.providerCode.trim();
    const modelName = input.modelName.trim();
    const modelType = input.modelType;
    const provider = await this.providersRepo.findOne({ where: { code: providerCode } });
    if (!provider) throw new BadRequestException(`LLM provider not found: ${providerCode}`);

    const existing = await this.repo.findOne({
      where: {
        providerCode,
        modelName,
        modelType,
      },
    });
    if (existing) {
      throw new ConflictException(`模型已存在：${providerCode} / ${modelType} / ${modelName}`);
    }

    const row = this.repo.create({
      providerCode,
      modelName,
      modelType,
      requestPathSuffix: normSuffix(input.requestPathSuffix),
      isActive: input.isActive ?? true,
      embeddingDimensions: inferEmbeddingDimensions(modelType, modelName, input.embeddingDimensions),
    });
    let saved: LlmModel;
    try {
      saved = await this.repo.save(row);
    } catch (e: unknown) {
      if (
        e instanceof QueryFailedError &&
        typeof (e as { driverError?: { code?: string; constraint?: string } }).driverError?.code === 'string' &&
        (e as { driverError?: { code?: string; constraint?: string } }).driverError?.code === '23505'
      ) {
        const constraint = (e as { driverError?: { constraint?: string } }).driverError?.constraint;
        if (!constraint || constraint === 'uq_llm_models_unique' || constraint.includes('llm_models')) {
          throw new ConflictException(`模型已存在：${providerCode} / ${modelType} / ${modelName}`);
        }
      }
      throw e;
    }

    await this.syncPlatformCatalogPricing(saved.id, saved.modelName, saved.modelType, {
      inputPricePerMillion: input.inputPricePerMillion ?? 0,
      outputPricePerMillion: input.outputPricePerMillion ?? 0,
      embeddingPricePerMillion: input.embeddingPricePerMillion ?? 0,
    });

    const priceMap = await this.billing.getActivePlatformCatalogPricingByModelNames([saved.modelName]);
    return toModelInfo(saved, priceMap.get(saved.modelName) ?? null);
  }

  async update(id: string, patch: UpdateLlmModelDto): Promise<LlmModelInfo> {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`LLM model not found: ${id}`);
    if (patch.requestPathSuffix !== undefined) m.requestPathSuffix = normSuffix(patch.requestPathSuffix);
    if (patch.isActive !== undefined) m.isActive = patch.isActive;
    if (m.modelType === 'embedding' && patch.embeddingDimensions !== undefined) {
      m.embeddingDimensions =
        patch.embeddingDimensions === null
          ? null
          : typeof patch.embeddingDimensions === 'number'
            ? Math.floor(patch.embeddingDimensions)
            : m.embeddingDimensions;
    }
    const saved = await this.repo.save(m);

    const patchAnyPrice =
      patch.inputPricePerMillion !== undefined ||
      patch.outputPricePerMillion !== undefined ||
      patch.embeddingPricePerMillion !== undefined;
    if (patchAnyPrice) {
      const current = (await this.billing.getActivePlatformCatalogPricingByModelNames([m.modelName])).get(m.modelName);
      const inn =
        patch.inputPricePerMillion !== undefined
          ? patch.inputPricePerMillion
          : current
            ? parseFloat(current.inputPricePerMillion)
            : 0;
      const out =
        patch.outputPricePerMillion !== undefined
          ? patch.outputPricePerMillion
          : current
            ? parseFloat(current.outputPricePerMillion)
            : 0;
      const emb =
        patch.embeddingPricePerMillion !== undefined
          ? patch.embeddingPricePerMillion
          : current
            ? parseFloat(current.embeddingPricePerMillion)
            : 0;
      await this.syncPlatformCatalogPricing(saved.id, saved.modelName, saved.modelType, {
        inputPricePerMillion: inn,
        outputPricePerMillion: out,
        embeddingPricePerMillion: emb,
      });
    }

    const priceMap = await this.billing.getActivePlatformCatalogPricingByModelNames([saved.modelName]);
    return toModelInfo(saved, priceMap.get(saved.modelName) ?? null);
  }

  async remove(id: string): Promise<void> {
    const used = await this.repo.manager.query(`select count(*)::int as c from llm_keys where llm_model_id = $1`, [id]);
    if (Array.isArray(used) && Number(used[0]?.c) > 0) {
      throw new BadRequestException('该模型仍有关联的 Key，无法删除（请先迁移/删除 Key）');
    }
    await this.repo.delete({ id });
  }
}
