import { EMBEDDING_PATH_MULTIMODAL, EMBEDDING_PATH_TEXT, PROVIDER_KIND_LABELS } from './constants';
import {
  catalogCreditsPerMillionFromYuan,
  yuanPerMillionTokensFromCatalogCredits,
} from '../../billing/constants';
import type {
  ApiLlmKey,
  ApiLlmKeyPoolGroup,
  ApiLlmModel,
  ApiLlmProvider,
  ModelKey,
  ProviderGroup,
  ProviderModel
} from './types';

export function isEmbeddingPathStandard(s: string | null | undefined): boolean {
  const v = String(s ?? '').trim();
  return v === EMBEDDING_PATH_TEXT || v === EMBEDDING_PATH_MULTIMODAL;
}

export function catalogPriceStringToNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function catalogCreditsPerMillionToFormYuan(
  value: string | number | null | undefined,
): number | undefined {
  const n = catalogPriceStringToNumber(value == null ? undefined : String(value));
  if (n == null) return undefined;
  return yuanPerMillionTokensFromCatalogCredits(n);
}

export function catalogFormYuanToCreditsPerMillion(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return catalogCreditsPerMillionFromYuan(n);
}

export function mapModelPricingFormToApiPayload(values: {
  inputPricePerMillion?: unknown;
  outputPricePerMillion?: unknown;
  embeddingPricePerMillion?: unknown;
}): {
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  embeddingPricePerMillion?: number;
} {
  const out: {
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    embeddingPricePerMillion?: number;
  } = {};
  const inn = catalogFormYuanToCreditsPerMillion(values.inputPricePerMillion);
  const o = catalogFormYuanToCreditsPerMillion(values.outputPricePerMillion);
  const emb = catalogFormYuanToCreditsPerMillion(values.embeddingPricePerMillion);
  if (inn != null) out.inputPricePerMillion = inn;
  if (o != null) out.outputPricePerMillion = o;
  if (emb != null) out.embeddingPricePerMillion = emb;
  return out;
}

export function catalogPriceRules(label: string) {
  return [
    { required: true, message: `请填写${label}` },
    {
      validator: async (_: unknown, v: unknown) => {
        if (v === null || v === undefined || v === '') {
          throw new Error(`请填写${label}`);
        }
        const n = Number(v);
        if (!Number.isFinite(n)) {
          throw new Error(`${label}须为有效数字`);
        }
        if (n < 0) {
          throw new Error(`${label}不能为负数`);
        }
      }
    }
  ];
}

export function inferKeyEnvironment(alias: string): ModelKey['environment'] {
  const lower = alias.toLowerCase();
  if (lower.includes('prod')) return 'prod';
  if (lower.includes('stag')) return 'staging';
  return 'dev';
}

export function mapApiKeyToModelKey(key: ApiLlmKey): ModelKey {
  const quota = Number(key.dailyQuotaTokens);
  const used = Number(key.usedTodayTokens);
  const usedRate =
    quota > 0 && Number.isFinite(used) ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return {
    id: key.id,
    alias: key.keyAlias,
    status: key.isActive ? 'active' : 'disabled',
    environment: inferKeyEnvironment(key.keyAlias),
    dailyQuotaTokens: Number.isFinite(quota) && quota > 0 ? quota : 0,
    usedTodayTokens: Number.isFinite(used) ? used : 0,
    usedRate
  };
}

export function buildProviderGroups(
  providers: ApiLlmProvider[],
  models: ApiLlmModel[],
  groups: ApiLlmKeyPoolGroup[]
): ProviderGroup[] {
  const providerMeta = new Map<string, ApiLlmProvider>();
  for (const provider of providers) {
    providerMeta.set(provider.code, provider);
  }
  const providerMap = new Map<string, ProviderGroup>();
  const ensureProvider = (providerCode: string, displayName?: string): ProviderGroup => {
    const existing = providerMap.get(providerCode);
    if (existing) return existing;
    const metadata = providerMeta.get(providerCode);
    const created: ProviderGroup = {
      id: providerCode,
      name: displayName || metadata?.displayName || providerCode,
      region: metadata?.kind ? (PROVIDER_KIND_LABELS[metadata.kind] ?? metadata.kind) : '—',
      models: []
    };
    providerMap.set(providerCode, created);
    return created;
  };

  for (const provider of providers) {
    ensureProvider(provider.code, provider.displayName);
  }

  for (const model of models) {
    const provider = ensureProvider(model.providerCode);
    provider.models.push({
      id: model.id,
      name: model.modelName,
      modelType: model.modelType,
      requestPathSuffix: model.requestPathSuffix,
      embeddingDimensions: model.embeddingDimensions ?? null,
      isActive: model.isActive,
      capabilities: [model.modelType],
      keys: [],
      catalogPricing: model.catalogPricing ?? null
    });
  }

  const modelIndex = new Map<string, ProviderModel>();
  for (const provider of providerMap.values()) {
    for (const model of provider.models) {
      modelIndex.set(`${provider.id}::${model.name}`, model);
    }
  }

  for (const group of groups) {
    const provider = ensureProvider(group.provider, group.providerDisplayName);
    const modelKey = `${group.provider}::${group.modelName}`;
    let model = modelIndex.get(modelKey);
    if (!model) {
      model = {
        id: modelKey,
        name: group.modelName,
        modelType: group.modelType ?? 'other',
        requestPathSuffix: null,
        isActive: true,
        capabilities: [group.modelType ?? 'other'],
        keys: []
      };
      provider.models.push(model);
      modelIndex.set(modelKey, model);
    }
    model.keys = group.keys.map(mapApiKeyToModelKey);
  }

  const normalized = Array.from(providerMap.values()).map((provider) => ({
    ...provider,
    models: [...provider.models].sort((a, b) => a.name.localeCompare(b.name))
  }));
  normalized.sort((a, b) => a.name.localeCompare(b.name));
  return normalized;
}

export function formatCatalogPricing(model: ProviderModel): string | null {
  const p = model.catalogPricing;
  if (!p) return null;
  if (model.modelType === 'embedding') {
    const yuan = yuanPerMillionTokensFromCatalogCredits(Number(p.embeddingPricePerMillion));
    return `向量 ¥${yuan.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}/百万 tokens`;
  }
  const inY = yuanPerMillionTokensFromCatalogCredits(Number(p.inputPricePerMillion));
  const outY = yuanPerMillionTokensFromCatalogCredits(Number(p.outputPricePerMillion));
  return `输入 ¥${inY.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} · 输出 ¥${outY.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}/百万 tokens`;
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
