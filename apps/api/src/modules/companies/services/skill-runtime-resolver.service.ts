import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CEO_SKILL_LAYERS,
  mergeCeoLayerRuntimeSkillIds,
  normalizeCeoLayerConfig,
  type CeoSkillLayer,
} from '@foundry/skills';
import { Repository } from 'typeorm';
import { CacheService } from '../../../common/cache/cache.service.js';
import { SkillBindingValidatorService } from '../../skills/services/skill-binding-validator.service.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { CompanyCeoLayerConfig } from '../entities/company-ceo-layer-config.entity.js';

/**
 * CEO 技能运行时解析：**仅**读取公司已持久化的 `company_ceo_layer_configs.ceo_layer_config` 三层结构；
 * Redis 缓存键带 `company:{companyId}:` 前缀与公司行 `updated_at` 版本，TTL 60s。
 */
@Injectable()
export class SkillRuntimeResolverService {
  private readonly logger = new Logger(SkillRuntimeResolverService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly skills: SkillsService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    @InjectRepository(CompanyCeoLayerConfig)
    private readonly companyCeoRepo: Repository<CompanyCeoLayerConfig>,
  ) {}

  /**
   * P13 运行时二次防护：剔除未在公司绑定目录中的 skillId（不抛错）。
   */
  private async filterResolvedConfigForCompany(
    companyId: string,
    cfg: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...cfg };
    for (const layer of CEO_SKILL_LAYERS) {
      const raw = out[layer];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = { ...(raw as Record<string, unknown>) };
      const ids = Array.isArray(item.skillIds)
        ? (item.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      const allowed = await this.skillBindingValidator.filterSkillIdsToCompanyCatalog(companyId, ids);
      const removed = ids.filter((id) => !allowed.includes(id));
      if (removed.length) {
        this.logger.warn('ceo_runtime_skill_ids_filtered_unbound', { companyId, layer, removed });
      }
      item.skillIds = allowed;

      // P0-Phase5: governance must be filtered alongside skillIds (defensive).
      const gov =
        item.skillGovernance && typeof item.skillGovernance === 'object' && !Array.isArray(item.skillGovernance)
          ? (item.skillGovernance as Record<string, unknown>)
          : null;
      if (gov) {
        const filteredGov: Record<string, unknown> = {};
        for (const id of allowed) {
          if (id && Object.prototype.hasOwnProperty.call(gov, id)) {
            filteredGov[id] = gov[id] as any;
          }
        }
        item.skillGovernance = filteredGov;
      }
      out[layer] = item;
    }
    return normalizeCeoLayerConfig(out);
  }

  /** Redis 适配器 get 会 JSON.parse；内存适配器返回原始值。兼容 string 与 object 两种形态。 */
  private parseCachedCeoLayerConfig(cached: unknown): Record<string, unknown> | null {
    if (!cached) return null;
    if (typeof cached === 'object' && !Array.isArray(cached)) {
      return cached as Record<string, unknown>;
    }
    if (typeof cached !== 'string') return null;
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* corrupt */
    }
    return null;
  }

  private governanceSnapshotFromSkillRow(skill: any): Record<string, unknown> {
    const category = Array.isArray(skill?.category)
      ? (skill.category as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 16)
      : null;
    return {
      maxInputTokens: typeof skill?.maxInputTokens === 'number' ? Math.floor(skill.maxInputTokens) : null,
      maxOutputTokens: typeof skill?.maxOutputTokens === 'number' ? Math.floor(skill.maxOutputTokens) : null,
      maxInputSizeBytes: typeof skill?.maxInputSizeBytes === 'number' ? Math.floor(skill.maxInputSizeBytes) : null,
      timeoutSeconds: typeof skill?.timeoutSeconds === 'number' ? Math.floor(skill.timeoutSeconds) : null,
      chunkStrategy: typeof skill?.chunkStrategy === 'string' ? String(skill.chunkStrategy).trim() : null,
      category,
      icon: typeof skill?.icon === 'string' ? skill.icon : null,
      // keep risk info for tool execution gating
      securityProfile: typeof skill?.securityProfile === 'string' ? String(skill.securityProfile).trim() : null,
    };
  }

  /**
   * 与 {@link getResolvedCeoTemplateForWorker} 相同，便于按 Checklist 命名对外暴露。
   */
  async resolve(companyId: string, templateRow: MarketplaceAgent | null): Promise<Record<string, unknown>> {
    return this.getResolvedCeoTemplateForWorker(companyId, templateRow);
  }

  /**
   * Worker 经 `companies.ceoLayerConfig.getConfig` 拉取的 **companyConfig**（公司 `ceo_layer_config` 快照经孤儿过滤）。
   * `templateRow` 仅用于非 `ceo` slug 的直通归一化；CEO 路径忽略模板内的 skill 合并。
   */
  async getResolvedCeoTemplateForWorker(
    companyId: string,
    templateRow: MarketplaceAgent | null,
  ): Promise<Record<string, unknown>> {
    if (!templateRow) {
      return {};
    }
    if (templateRow.slug !== 'ceo') {
      return normalizeCeoLayerConfig(templateRow.ceoLayerConfig ?? {});
    }

    const row = await this.companyCeoRepo.findOne({ where: { companyId } });
    const ver = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    const cacheKey = `company:${companyId}:ceo_skill_runtime:companycfg:${ver}`;

    const cached = await this.cache.get(cacheKey);
    const parsed = this.parseCachedCeoLayerConfig(cached);
    if (parsed) {
      return await this.filterResolvedConfigForCompany(companyId, parsed);
    }
    if (cached) {
      this.logger.warn('ceo_skill_runtime_cache_corrupt', { companyId, cacheKey });
      await this.cache.delete(cacheKey);
    }

    const baseNorm = normalizeCeoLayerConfig(row?.ceoLayerConfig ?? {});
    const perLayerValidIds: Record<CeoSkillLayer, string[]> = {
      strategy: [],
      orchestration: [],
      supervision: [],
    };

    for (const layer of CEO_SKILL_LAYERS) {
      const layerCfg = baseNorm[layer] as Record<string, unknown> | undefined;
      const declared = Array.isArray(layerCfg?.skillIds)
        ? (layerCfg!.skillIds as unknown[])
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
        : [];
      perLayerValidIds[layer] = await this.skills.filterExistingGlobalSkillIds(declared);
    }

    const merged = mergeCeoLayerRuntimeSkillIds({
      baseNormalized: baseNorm,
      perLayerValidIds,
      recommendedIds: [],
      autoFillEmptyLayersFromRecommended: false,
    });

    // P0-Phase5: attach governance snapshots for the declared skillIds (no extra worker DB lookups).
    const mergedWithGov: Record<string, unknown> = { ...(merged as any) };
    const allIds = new Set<string>();
    for (const layer of CEO_SKILL_LAYERS) {
      const layerCfg = mergedWithGov[layer] as any;
      const ids = Array.isArray(layerCfg?.skillIds) ? (layerCfg.skillIds as unknown[]) : [];
      for (const id of ids) {
        const s = String(id ?? '').trim();
        if (s) allIds.add(s);
      }
    }
    const rows =
      allIds.size > 0 ? await this.skills.findByIdsForTenant([...allIds], companyId) : [];
    const byId = new Map(rows.map((r: any) => [String(r.id), r]));
    for (const layer of CEO_SKILL_LAYERS) {
      const layerCfg = mergedWithGov[layer];
      if (!layerCfg || typeof layerCfg !== 'object' || Array.isArray(layerCfg)) continue;
      const item = { ...(layerCfg as Record<string, unknown>) };
      const ids = Array.isArray(item.skillIds)
        ? (item.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      const gov: Record<string, unknown> = {};
      for (const id of ids) {
        const sk = byId.get(id);
        if (sk) gov[id] = this.governanceSnapshotFromSkillRow(sk);
      }
      item.skillGovernance = gov;
      mergedWithGov[layer] = item;
    }

    const filtered = await this.filterResolvedConfigForCompany(companyId, mergedWithGov);
    await this.cache.set(cacheKey, filtered, 60);
    return filtered;
  }
}
