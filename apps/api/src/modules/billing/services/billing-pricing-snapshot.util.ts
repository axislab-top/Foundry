import { BILLING_CURRENCY } from '../billing-currency.js';
import type { AppendBillingRecordDto } from '../dto/append-billing-record.dto.js';
import type { ModelPricing } from '../entities/model-pricing.entity.js';

function readNumeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** True if JSON has per-million input/output prices so tryComputeCostFromPricingSnapshotJson can price LLM rows. */
export function isCompleteLlmPricingSnapshotJson(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const r = s as Record<string, unknown>;
  const pin = readNumeric(r.inputPricePerMillion ?? r.input_price_per_million);
  const pout = readNumeric(r.outputPricePerMillion ?? r.output_price_per_million);
  return pin !== null && pout !== null;
}

function readCurrency(snap: Record<string, unknown>): string {
  const c = snap.currency;
  if (typeof c === 'string' && c.length >= 3 && c.length <= 8) {
    return c;
  }
  return BILLING_CURRENCY;
}

/**
 * 从客户端或服务端冻结的 JSON 快照计算 cost；不完整则返回 null（由调用方回退 resolvePricing）。
 */
export function tryComputeCostFromPricingSnapshotJson(
  dto: AppendBillingRecordDto,
  snapshot: Record<string, unknown>,
): { cost: number; currency: string } | null {
  const currency = readCurrency(snapshot);
  const inTok = dto.inputTokens ?? 0;
  const outTok = dto.outputTokens ?? 0;
  const units = dto.skillCallUnits ?? 0;

  if (dto.recordType === 'skill') {
    const base = readNumeric(snapshot.skillBaseFee ?? snapshot.skill_base_fee);
    if (base === null) return null;
    const u = units > 0 ? units : 1;
    const cost = Math.round(base * u * 1e6) / 1e6;
    return { cost: Math.max(0, cost), currency };
  }

  if (dto.recordType === 'agent_day') {
    return null;
  }

  if (dto.recordType === 'embedding') {
    const p = readNumeric(snapshot.embeddingPricePerMillion ?? snapshot.embedding_price_per_million);
    if (p === null) return null;
    const cost = Math.round((inTok / 1_000_000) * p * 1e6) / 1e6;
    return { cost: Math.max(0, cost), currency };
  }

  if (dto.recordType === 'llm' || dto.recordType === 'summary' || dto.recordType === 'other') {
    const pin = readNumeric(snapshot.inputPricePerMillion ?? snapshot.input_price_per_million);
    const pout = readNumeric(snapshot.outputPricePerMillion ?? snapshot.output_price_per_million);
    if (pin === null || pout === null) return null;
    const c = (inTok / 1_000_000) * pin + (outTok / 1_000_000) * pout;
    const cost = Math.round(c * 1e6) / 1e6;
    return { cost: Math.max(0, cost), currency };
  }

  return null;
}

export function modelPricingToSnapshotJson(p: ModelPricing): Record<string, unknown> {
  return {
    modelName: p.modelName,
    inputPricePerMillion: p.inputPricePerMillion,
    outputPricePerMillion: p.outputPricePerMillion,
    embeddingPricePerMillion: p.embeddingPricePerMillion,
    skillBaseFee: p.skillBaseFee,
    currency: p.currency,
    effectiveFrom: p.effectiveFrom instanceof Date ? p.effectiveFrom.toISOString() : p.effectiveFrom,
    effectiveTo: p.effectiveTo ? (p.effectiveTo instanceof Date ? p.effectiveTo.toISOString() : p.effectiveTo) : null,
    source: 'model_pricing_row',
    resolvedAt: new Date().toISOString(),
  };
}
