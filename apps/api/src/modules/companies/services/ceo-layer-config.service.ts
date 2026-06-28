import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ensureFullCeoLayerShape,
  mergeCeoLayerConfigFromTemplate,
  normalizeCeoLayerConfig,
} from '@foundry/skills';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '@service/tenant';
import { CompanyCeoLayerConfig } from '../entities/company-ceo-layer-config.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { SkillBindingService } from './skill-binding.service.js';

/** 平台下发字段 → Worker `resolveLayerSetting(intent)` 读取的 `strategy.contextPolicy.intentLayer.*` */
function mergePlatformIntentFieldsIntoIntentLayer(
  intentLayer: Record<string, unknown>,
  globalSettings: Record<string, unknown>,
): Record<string, unknown> {
  const priorGs =
    intentLayer.globalSettings && typeof intentLayer.globalSettings === 'object' && !Array.isArray(intentLayer.globalSettings)
      ? (intentLayer.globalSettings as Record<string, unknown>)
      : {};
  const nextGs = { ...priorGs, ...globalSettings };
  delete nextGs.llmSystemPrompt;
  const next: Record<string, unknown> = {
    ...intentLayer,
    globalSettings: nextGs,
  };
  const modelFromPatch =
    typeof globalSettings.model === 'string' && globalSettings.model.trim()
      ? globalSettings.model.trim()
      : '';
  if (modelFromPatch) {
    next.modelName = modelFromPatch;
  } else if (Object.prototype.hasOwnProperty.call(globalSettings, 'model')) {
    const raw = globalSettings.model;
    if (raw === '' || raw === null || raw === undefined) {
      delete next.modelName;
    }
  }
  if (Object.prototype.hasOwnProperty.call(globalSettings, 'modelKeyId')) {
    const rawK = globalSettings.modelKeyId;
    const k = typeof rawK === 'string' ? rawK.trim() : '';
    if (k) {
      next.keyIds = [k];
      next.llmKeyId = k;
      next.keySource = 'dedicated';
    } else {
      delete next.keyIds;
      delete next.llmKeyId;
      delete next.keySource;
    }
  }
  return next;
}

function hasEffectiveContextPolicySubLayer(sub: unknown): boolean {
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return false;
  const o = sub as Record<string, unknown>;
  const model = typeof o.modelName === 'string' ? o.modelName.trim() : '';
  const keyIds = Array.isArray(o.keyIds)
    ? (o.keyIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const llmKeyId = typeof o.llmKeyId === 'string' ? o.llmKeyId.trim() : '';
  return Boolean(model || keyIds.length > 0 || llmKeyId);
}

/**
 * 公司 `ceo_layer_config` 行缺 replay/intent 时，在 **读取路径** 叠加平台 `platform_settings`（不写回 DB）。
 * Worker 经 `companies.ceoLayerConfig.getConfig` 拉取时应能看到有效 replay 配置。
 */
export function mergePlatformContextPolicyFallback(
  companyConfig: Record<string, unknown>,
  platformReplay: Record<string, unknown>,
  platformIntent: Record<string, unknown>,
): Record<string, unknown> {
  const strategy =
    companyConfig.strategy && typeof companyConfig.strategy === 'object' && !Array.isArray(companyConfig.strategy)
      ? ({ ...(companyConfig.strategy as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const cp =
    strategy.contextPolicy && typeof strategy.contextPolicy === 'object' && !Array.isArray(strategy.contextPolicy)
      ? ({ ...(strategy.contextPolicy as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const nextCp = { ...cp };

  if (!hasEffectiveContextPolicySubLayer(nextCp.replay) && Object.keys(platformReplay).length > 0) {
    nextCp.replay = { ...platformReplay };
  }
  if (!hasEffectiveContextPolicySubLayer(nextCp.intentLayer) && Object.keys(platformIntent).length > 0) {
    const cur =
      nextCp.intentLayer && typeof nextCp.intentLayer === 'object' && !Array.isArray(nextCp.intentLayer)
        ? (nextCp.intentLayer as Record<string, unknown>)
        : {};
    nextCp.intentLayer = mergePlatformIntentFieldsIntoIntentLayer(cur, platformIntent);
  }

  return {
    ...companyConfig,
    strategy: {
      ...strategy,
      contextPolicy: nextCp,
    },
  };
}

/** 保存 CEO L1/L2/L3 时保留已有 `contextPolicy.replay` / `intentLayer`（Admin 三层 Tab 不传这两块）。 */
export function preserveContextPolicyOnLayerSave(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return incoming;
  const exStrat =
    existing.strategy && typeof existing.strategy === 'object' && !Array.isArray(existing.strategy)
      ? (existing.strategy as Record<string, unknown>)
      : null;
  const inStrat =
    incoming.strategy && typeof incoming.strategy === 'object' && !Array.isArray(incoming.strategy)
      ? (incoming.strategy as Record<string, unknown>)
      : null;
  if (!exStrat || !inStrat) return incoming;
  const exCp =
    exStrat.contextPolicy && typeof exStrat.contextPolicy === 'object' && !Array.isArray(exStrat.contextPolicy)
      ? (exStrat.contextPolicy as Record<string, unknown>)
      : {};
  const inCp =
    inStrat.contextPolicy && typeof inStrat.contextPolicy === 'object' && !Array.isArray(inStrat.contextPolicy)
      ? ({ ...(inStrat.contextPolicy as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const nextCp = { ...inCp };
  for (const key of ['intentLayer', 'replay'] as const) {
    if (!hasEffectiveContextPolicySubLayer(nextCp[key]) && hasEffectiveContextPolicySubLayer(exCp[key])) {
      nextCp[key] = exCp[key];
    }
  }
  return {
    ...incoming,
    strategy: {
      ...inStrat,
      contextPolicy: nextCp,
    },
  };
}

/**
 * 合并单层 intentLayer / replay：模板层叠在公司层之上，但若模板未提供有效 keyIds / modelName，
 * 保留公司已下发的平台配置（避免商城保存 CEO 模板时用「空 replay」覆盖掉 Replay 全局设置里的密钥池）。
 */
function mergeContextPolicySubLayer(
  cur: Record<string, unknown> | undefined,
  tpl: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    cur && typeof cur === 'object' && !Array.isArray(cur) ? ({ ...cur } as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base, ...tpl };
  const tplKids = Array.isArray(tpl.keyIds)
    ? (tpl.keyIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const baseKids = Array.isArray(base.keyIds)
    ? (base.keyIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  if (tplKids.length === 0 && baseKids.length > 0) {
    out.keyIds = baseKids;
    if (!out.llmKeyId && typeof base.llmKeyId === 'string' && base.llmKeyId.trim()) {
      out.llmKeyId = base.llmKeyId.trim();
    }
    if (!out.keySource && (base.keySource === 'shared' || base.keySource === 'dedicated')) {
      out.keySource = base.keySource;
    }
  }
  const tplModel = typeof tpl.modelName === 'string' ? tpl.modelName.trim() : '';
  const baseModel = typeof base.modelName === 'string' ? base.modelName.trim() : '';
  if (!tplModel && baseModel) {
    out.modelName = baseModel;
  }
  const tplMpc = typeof tpl.modelProviderCode === 'string' ? tpl.modelProviderCode.trim() : '';
  const baseMpc = typeof base.modelProviderCode === 'string' ? base.modelProviderCode.trim() : '';
  if (!tplMpc && baseMpc) {
    out.modelProviderCode = baseMpc;
  }
  return out;
}

/**
 * 商城模板若携带 `strategy.contextPolicy.intentLayer` / `replay`，与现有公司行深度合并，
 * 避免 `mergeCeoLayerConfigFromTemplate` 在 strategy 上浅合并导致「公司已有一层 contextPolicy 时永远吃不到模板更新的 Intent/Replay 绑定」。
 */
function mergeTemplateContextPolicyIntentReplay(
  mergedFromLayers: Record<string, unknown>,
  templateSnap: Record<string, unknown>,
): Record<string, unknown> {
  const ms = mergedFromLayers.strategy;
  const ts = templateSnap.strategy;
  if (!ms || typeof ms !== 'object' || Array.isArray(ms)) return mergedFromLayers;
  if (!ts || typeof ts !== 'object' || Array.isArray(ts)) return mergedFromLayers;
  const mCp = ((ms as Record<string, unknown>).contextPolicy ?? {}) as Record<string, unknown>;
  const tCp = ((ts as Record<string, unknown>).contextPolicy ?? {}) as Record<string, unknown>;
  if (!tCp || typeof tCp !== 'object' || Array.isArray(tCp)) return mergedFromLayers;
  const nextCp = { ...mCp };
  for (const key of ['intentLayer', 'replay'] as const) {
    const tplLayer = tCp[key];
    if (!tplLayer || typeof tplLayer !== 'object' || Array.isArray(tplLayer)) continue;
    const curLayer = mCp[key];
    const cur =
      curLayer && typeof curLayer === 'object' && !Array.isArray(curLayer)
        ? (curLayer as Record<string, unknown>)
        : undefined;
    nextCp[key] = mergeContextPolicySubLayer(cur, tplLayer as Record<string, unknown>);
  }
  return {
    ...mergedFromLayers,
    strategy: {
      ...(ms as Record<string, unknown>),
      contextPolicy: nextCp,
    },
  };
}

/**
 * 公司级 `company_ceo_layer_configs`：**运行时单一真相源**（`ceo_layer_config` JSON）；
 * 新建公司时从商城 `slug=ceo` 模板原子拷贝/合并；`SkillRuntimeResolverService` 只读此处。
 */
@Injectable()
export class CeoLayerConfigService {
  private readonly logger = new Logger(CeoLayerConfigService.name);

  constructor(
    @InjectRepository(CompanyCeoLayerConfig)
    private readonly companyCeoRepo: Repository<CompanyCeoLayerConfig>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    private readonly dataSource: DataSource,
    private readonly skillBindingService: SkillBindingService,
  ) {}

  private snapshotFromTemplate(template: MarketplaceAgent): Record<string, unknown> {
    return normalizeCeoLayerConfig(template.ceoLayerConfig ?? {});
  }

  /**
   * **事务内**将商城模板三层合并进公司行：`mergeCeoLayerConfigFromTemplate`（缺失字段从模板补齐；
   * skillIds 为模板∪公司并集），再 **`ensureFullCeoLayerShape`** 保证三层键完整。
   * 使用 `pg_advisory_xact_lock` 串行化同公司并发写入。
   */
  async atomicEnsureAndSync(
    companyId: string,
    templateConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const templateSnap = normalizeCeoLayerConfig(templateConfig);
    let persisted: Record<string, unknown> = {};
    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`ceo_layer_cfg:${companyId}`]);
      const repo = manager.getRepository(CompanyCeoLayerConfig);
      const existing = await repo.findOne({ where: { companyId } });
      const companyNorm = existing
        ? normalizeCeoLayerConfig(existing.ceoLayerConfig ?? {})
        : ({} as Record<string, unknown>);
      const merged = ensureFullCeoLayerShape(mergeCeoLayerConfigFromTemplate(templateSnap, companyNorm));
      if (!existing) {
        await repo.save(repo.create({ companyId, ceoLayerConfig: merged }));
      } else {
        existing.ceoLayerConfig = merged;
        await repo.save(existing);
      }
      persisted = merged;
    });
    return normalizeCeoLayerConfig(persisted);
  }

  /**
   * 幂等：**按层**将商城 CEO 模板合并进 `company_ceo_layer_configs`（委托 {@link atomicEnsureAndSync}）。
   */
  async ensureLayerConfigForCompany(companyId: string, template: MarketplaceAgent): Promise<Record<string, unknown>> {
    return this.atomicEnsureAndSync(companyId, template.ceoLayerConfig ?? {});
  }

  async saveLayerConfig(companyId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.getStoredLayerConfig(companyId);
    const withPreserved = preserveContextPolicyOnLayerSave(
      existing,
      normalizeCeoLayerConfig(config),
    );
    const normalized = ensureFullCeoLayerShape(withPreserved);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const repo = manager.getRepository(CompanyCeoLayerConfig);
      let row = await repo.findOne({ where: { companyId } });
      if (!row) {
        row = repo.create({ companyId, ceoLayerConfig: normalized });
      } else {
        row.ceoLayerConfig = normalized;
      }
      await repo.save(row);
    });
    return normalized;
  }

  async getStoredLayerConfig(companyId: string): Promise<Record<string, unknown> | null> {
    const row = await this.companyCeoRepo.findOne({ where: { companyId } });
    return row ? (row.ceoLayerConfig as Record<string, unknown>) : null;
  }

  /**
   * 将**内存中的**三层 JSON（通常与 `company_ceo_layer_configs` 已提交快照一致）声明式同步到 CEO `agent_skills`（并集、增量补缺）。
   */
  async syncLayerConfigToCeoAgent(
    companyId: string,
    ceoAgentId: string,
    layerConfig: Record<string, unknown>,
  ): Promise<void> {
    await this.skillBindingService.syncSkillsFromLayerConfig(companyId, ceoAgentId, layerConfig);
  }

  /**
   * 管理端 / RPC：将当前 **公司已持久化的** 三层配置同步到 CEO `agent_skills`（增量补缺）。
   */
  async syncStoredLayerConfigToCeoAgent(companyId: string, ceoAgentId: string): Promise<void> {
    const stored = await this.getStoredLayerConfig(companyId);
    if (!stored) {
      this.logger.warn('syncStoredLayerConfigToCeoAgent: no company ceo_layer_config row', { companyId });
      return;
    }
    await this.syncLayerConfigToCeoAgent(companyId, ceoAgentId, stored);
  }

  /**
   * 商城 CEO 模板保存后：把所有公司的快照与 CEO Agent 技能对齐到最新模板。
   */
  async propagateMarketplaceCeoTemplateToAllCompanies(template: MarketplaceAgent): Promise<void> {
    const templateSnap = ensureFullCeoLayerShape(this.snapshotFromTemplate(template));
    const companies = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM companies WHERE status = 'active'`,
    );
    for (const c of companies) {
      const cid = String(c.id ?? '').trim();
      if (!cid) continue;
      try {
        let mergedForSync: Record<string, unknown> = templateSnap;
        await this.dataSource.transaction(async (manager) => {
          await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [cid]);
          const repo = manager.getRepository(CompanyCeoLayerConfig);
          let row = await repo.findOne({ where: { companyId: cid } });
          if (!row) {
            row = repo.create({ companyId: cid, ceoLayerConfig: templateSnap });
            mergedForSync = templateSnap;
          } else {
            const existingNorm = normalizeCeoLayerConfig(row.ceoLayerConfig ?? {});
            const mergedLayers = mergeCeoLayerConfigFromTemplate(templateSnap, existingNorm);
            mergedForSync = ensureFullCeoLayerShape(
              mergeTemplateContextPolicyIntentReplay(mergedLayers, templateSnap),
            );
            row.ceoLayerConfig = mergedForSync;
          }
          await repo.save(row);
        });
        const ceo = await this.dataSource.transaction(async (manager) => {
          await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [cid]);
          return manager.getRepository(Agent).findOne({
            where: { companyId: cid, role: 'ceo' } as any,
            select: ['id'] as any,
          } as any);
        });
        if (ceo?.id) {
          await this.skillBindingService.syncSkillsFromLayerConfig(cid, ceo.id, mergedForSync);
        }
      } catch (err: unknown) {
        this.logger.warn('propagateMarketplaceCeoTemplateToAllCompanies: company failed', {
          companyId: cid,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private upsertIntentLayerGlobalSettings(
    currentConfig: Record<string, unknown>,
    globalSettings: Record<string, unknown>,
  ): Record<string, unknown> {
    const strategy = ((currentConfig.strategy ?? {}) as Record<string, unknown>) ?? {};
    const contextPolicy = ((strategy.contextPolicy ?? {}) as Record<string, unknown>) ?? {};
    const intentLayer = ((contextPolicy.intentLayer ?? {}) as Record<string, unknown>) ?? {};
    const ceoLayers =
      globalSettings.ceoLayers && typeof globalSettings.ceoLayers === 'object' && !Array.isArray(globalSettings.ceoLayers)
        ? (globalSettings.ceoLayers as Record<string, unknown>)
        : {};
    const resolveLayerPatch = (key: 'strategy' | 'orchestration' | 'supervision'): Record<string, unknown> => {
      const raw = ceoLayers[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const row = raw as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (typeof row.modelName === 'string' && row.modelName.trim()) {
        patch.modelName = row.modelName.trim();
      }
      if (typeof row.systemPrompt === 'string') {
        patch.systemPrompt = row.systemPrompt.trim();
      }
      if (Array.isArray(row.skillIds)) {
        patch.skillIds = row.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean);
      }
      if (Array.isArray(row.keyIds)) {
        const keyIds = row.keyIds.map((x) => String(x ?? '').trim()).filter(Boolean);
        patch.keyIds = keyIds;
        if (keyIds.length > 0) {
          patch.llmKeyId = keyIds[0];
          patch.keySource = 'dedicated';
        }
      }
      if (typeof row.temperature === 'number') {
        patch.temperature = row.temperature;
      }
      if (typeof row.enableMemoryRetrieval === 'boolean') {
        patch.enableMemoryRetrieval = row.enableMemoryRetrieval;
      }
      if (typeof row.historyMessagesLimit === 'number') {
        patch.historyMessagesLimit = row.historyMessagesLimit;
      }
      if (typeof row.timeoutMs === 'number') {
        patch.timeoutMs = row.timeoutMs;
      }
      if (
        row.distributionRuleMode === 'rules_first' ||
        row.distributionRuleMode === 'hybrid' ||
        row.distributionRuleMode === 'llm_assisted'
      ) {
        patch.distributionRuleMode = row.distributionRuleMode;
      }
      if (row.specialConfig && typeof row.specialConfig === 'object' && !Array.isArray(row.specialConfig)) {
        patch.specialConfig = { ...(row.specialConfig as Record<string, unknown>) };
      }
      return patch;
    };
    const strategyPatch = resolveLayerPatch('strategy');
    const orchestrationPatch = resolveLayerPatch('orchestration');
    const supervisionPatch = resolveLayerPatch('supervision');
    const strategyLayer = {
      ...(((currentConfig.strategy ?? {}) as Record<string, unknown>) ?? {}),
      ...strategyPatch,
    };
    const orchestrationLayer = {
      ...(((currentConfig.orchestration ?? {}) as Record<string, unknown>) ?? {}),
      ...orchestrationPatch,
    };
    const supervisionLayer = {
      ...(((currentConfig.supervision ?? {}) as Record<string, unknown>) ?? {}),
      ...supervisionPatch,
    };
    return {
      ...currentConfig,
      orchestration: orchestrationLayer,
      supervision: supervisionLayer,
      strategy: {
        ...strategyLayer,
        contextPolicy: {
          ...contextPolicy,
          intentLayer: mergePlatformIntentFieldsIntoIntentLayer(intentLayer, globalSettings),
        },
      },
    };
  }

  private upsertIntentLayerRules(
    currentConfig: Record<string, unknown>,
    rules: Record<string, unknown>[],
  ): Record<string, unknown> {
    const strategy = ((currentConfig.strategy ?? {}) as Record<string, unknown>) ?? {};
    const contextPolicy = ((strategy.contextPolicy ?? {}) as Record<string, unknown>) ?? {};
    const intentLayer = ((contextPolicy.intentLayer ?? {}) as Record<string, unknown>) ?? {};
    return {
      ...currentConfig,
      strategy: {
        ...strategy,
        contextPolicy: {
          ...contextPolicy,
          intentLayer: {
            ...intentLayer,
            rules: [...rules],
          },
        },
      },
    };
  }

  async applyPlatformIntentLayerGlobalSettingsToCompany(
    companyId: string,
    globalSettings: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const repo = manager.getRepository(CompanyCeoLayerConfig);
      let row = await repo.findOne({ where: { companyId } });
      const current = row?.ceoLayerConfig ?? {};
      const next = this.upsertIntentLayerGlobalSettings(
        normalizeCeoLayerConfig((current as Record<string, unknown>) ?? {}),
        globalSettings,
      );
      if (!row) {
        row = repo.create({
          companyId,
          ceoLayerConfig: next,
        });
      } else {
        row.ceoLayerConfig = next;
      }
      await repo.save(row);
    });
  }

  async propagatePlatformIntentLayerGlobalSettingsToAllCompanies(
    globalSettings: Record<string, unknown>,
  ): Promise<void> {
    const companies = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM companies WHERE status = 'active'`,
    );
    for (const c of companies) {
      const cid = String(c.id ?? '').trim();
      if (!cid) continue;
      try {
        await this.applyPlatformIntentLayerGlobalSettingsToCompany(cid, globalSettings);
      } catch (err: unknown) {
        this.logger.warn('propagatePlatformIntentLayerGlobalSettingsToAllCompanies: company failed', {
          companyId: cid,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async applyPlatformIntentLayerRulesToCompany(
    companyId: string,
    rules: Record<string, unknown>[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const repo = manager.getRepository(CompanyCeoLayerConfig);
      let row = await repo.findOne({ where: { companyId } });
      const current = row?.ceoLayerConfig ?? {};
      const next = this.upsertIntentLayerRules(
        normalizeCeoLayerConfig((current as Record<string, unknown>) ?? {}),
        rules,
      );
      if (!row) {
        row = repo.create({
          companyId,
          ceoLayerConfig: next,
        });
      } else {
        row.ceoLayerConfig = next;
      }
      await repo.save(row);
    });
  }

  async propagatePlatformIntentLayerRulesToAllCompanies(rules: Record<string, unknown>[]): Promise<void> {
    const companies = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM companies WHERE status = 'active'`,
    );
    for (const c of companies) {
      const cid = String(c.id ?? '').trim();
      if (!cid) continue;
      try {
        await this.applyPlatformIntentLayerRulesToCompany(cid, rules);
      } catch (err: unknown) {
        this.logger.warn('propagatePlatformIntentLayerRulesToAllCompanies: company failed', {
          companyId: cid,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private upsertReplayGlobalSettings(
    currentConfig: Record<string, unknown>,
    replay: Record<string, unknown>,
  ): Record<string, unknown> {
    const strategy = ((currentConfig.strategy ?? {}) as Record<string, unknown>) ?? {};
    const contextPolicy = ((strategy.contextPolicy ?? {}) as Record<string, unknown>) ?? {};
    const prevReplay =
      contextPolicy.replay && typeof contextPolicy.replay === 'object' && !Array.isArray(contextPolicy.replay)
        ? (contextPolicy.replay as Record<string, unknown>)
        : {};
    return {
      ...currentConfig,
      strategy: {
        ...strategy,
        contextPolicy: {
          ...contextPolicy,
          replay: {
            ...prevReplay,
            ...replay,
          },
        },
      },
    };
  }

  async applyPlatformReplayGlobalSettingsToCompany(companyId: string, replay: Record<string, unknown>): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const repo = manager.getRepository(CompanyCeoLayerConfig);
      let row = await repo.findOne({ where: { companyId } });
      const current = row?.ceoLayerConfig ?? {};
      const next = this.upsertReplayGlobalSettings(
        normalizeCeoLayerConfig((current as Record<string, unknown>) ?? {}),
        replay,
      );
      if (!row) {
        row = repo.create({
          companyId,
          ceoLayerConfig: next,
        });
      } else {
        row.ceoLayerConfig = next;
      }
      await repo.save(row);
    });
  }

  async propagatePlatformReplayGlobalSettingsToAllCompanies(replay: Record<string, unknown>): Promise<void> {
    const companies = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM companies WHERE status = 'active'`,
    );
    for (const c of companies) {
      const cid = String(c.id ?? '').trim();
      if (!cid) continue;
      try {
        await this.applyPlatformReplayGlobalSettingsToCompany(cid, replay);
      } catch (err: unknown) {
        this.logger.warn('propagatePlatformReplayGlobalSettingsToAllCompanies: company failed', {
          companyId: cid,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
