import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantContextService } from '@service/tenant';
import { Repository } from 'typeorm';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { CompanyEmbeddingSetting } from './company-embedding-setting.entity.js';

@Injectable()
export class CompanyEmbeddingSettingsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectRepository(CompanyEmbeddingSetting)
    private readonly settingsRepo: Repository<CompanyEmbeddingSetting>,
    @InjectRepository(LlmModel)
    private readonly llmModelsRepo: Repository<LlmModel>,
  ) {}

  getByCompanyId(companyId: string): Promise<CompanyEmbeddingSetting | null> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      return await this.settingsRepo.findOne({ where: { companyId } });
    });
  }

  /**
   * 返回可用于运行时 embedding 的 modelId（必须存在且 active 且 model_type=embedding），否则返回 null。
   */
  resolveEffectiveDefaultModelId(companyId: string): Promise<string | null> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const row = await this.settingsRepo.findOne({ where: { companyId } });
      const id = row?.defaultEmbeddingModelId?.trim() ?? '';
      if (!id) return null;
      const model = await this.llmModelsRepo.findOne({ where: { id, modelType: 'embedding' as any, isActive: true } as any });
      return model?.id ?? null;
    });
  }

  upsert(companyId: string, params: { defaultEmbeddingModelId?: string | null }): Promise<CompanyEmbeddingSetting> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const raw = params.defaultEmbeddingModelId ?? null;
      const nextId = raw && raw.trim() ? raw.trim() : null;

      if (nextId) {
        const model = await this.llmModelsRepo.findOne({ where: { id: nextId, modelType: 'embedding' as any } as any });
        if (!model) {
          throw new BadRequestException('defaultEmbeddingModelId 不存在或不是 embedding 模型');
        }
        if (!model.isActive) {
          throw new BadRequestException('defaultEmbeddingModelId 对应 embedding 模型未启用');
        }
      }

      const existing = await this.settingsRepo.findOne({ where: { companyId } });
      const saved = await this.settingsRepo.save(
        this.settingsRepo.create({
          ...(existing ?? { companyId }),
          companyId,
          defaultEmbeddingModelId: nextId,
        }),
      );
      return saved;
    });
  }

  remove(companyId: string): Promise<{ ok: true }> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.settingsRepo.delete({ companyId });
      return { ok: true as const };
    });
  }
}

