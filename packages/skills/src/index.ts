/**
 * CEO / Skills 运行时合并逻辑（纯函数，无 IO）。
 * 稳定标识：Skill **name**（种子与 UI 使用）；UUID 为 DB 外键。
 */

export const CEO_SKILL_LAYERS = ['strategy', 'orchestration', 'supervision'] as const;
export type CeoSkillLayer = (typeof CEO_SKILL_LAYERS)[number];

export function normalizeSkillNamesFromRecommended(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((x) => String(x ?? '').trim())
        .filter(Boolean),
    ),
  ];
}

/** 与 `marketplace-admin.service` 的 normalizeCeoLayerConfig 对齐，仅保留 strategy/orchestration/supervision 三层键。 */
export function normalizeCeoLayerConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const cfg = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const layer of CEO_SKILL_LAYERS) {
    const v = cfg[layer];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const item = { ...(v as Record<string, unknown>) };
    if (typeof item.systemPrompt === 'string') {
      item.systemPrompt = item.systemPrompt.trim();
    }
    if (typeof item.casualPrompt === 'string') {
      item.casualPrompt = item.casualPrompt.trim();
    }
    if (typeof item.structuredPrompt === 'string') {
      item.structuredPrompt = item.structuredPrompt.trim();
    }
    /** L3: optional per-stage prompt overrides (camelCase + snake_case aliases). */
    const trimStr = (k: string) => {
      if (typeof item[k] === 'string') {
        const t = (item[k] as string).trim();
        if (t) item[k] = t;
        else delete item[k];
      }
    };
    if (layer === 'supervision') {
      for (const k of [
        'heavyPlannerPrompt',
        'heavy_supervisor_split_prompt',
        'heavySupervisorSplitPrompt',
        'heavy_supervisor_decision_prompt',
        'heavySupervisorDecisionPrompt',
        'heavy_forced_arbitration_prompt',
        'heavyForcedArbitrationPrompt',
        'heavy_supervisor_post_review_prompt',
        'heavySupervisorPostReviewPrompt',
        'heavy_autonomous_plan_intent_prompt',
        'heavyAutonomousPlanIntentPrompt',
        'heavy_autonomous_plan_tasks_prompt',
        'heavyAutonomousPlanTasksPrompt',
      ]) {
        trimStr(k);
      }
    }
    if (Array.isArray(item.skillIds)) {
      item.skillIds = item.skillIds
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);
    }
    if (item.contextPolicy && typeof item.contextPolicy === 'object' && !Array.isArray(item.contextPolicy)) {
      item.contextPolicy = { ...(item.contextPolicy as Record<string, unknown>) };
    }
    if (item.cachePolicy && typeof item.cachePolicy === 'object' && !Array.isArray(item.cachePolicy)) {
      item.cachePolicy = { ...(item.cachePolicy as Record<string, unknown>) };
    }
    if (item.outputPolicy && typeof item.outputPolicy === 'object' && !Array.isArray(item.outputPolicy)) {
      item.outputPolicy = { ...(item.outputPolicy as Record<string, unknown>) };
    }
    out[layer] = item;
  }
  return out;
}

/**
 * 保证 `strategy` / `orchestration` / `supervision` 三层键均存在（对象形态），缺失层补 `{ skillIds: [] }`，
 * 已有层若缺 `skillIds` 则补空数组。用于公司 `ceo_layer_config` 持久化与运行时结构稳定。
 */
export function ensureFullCeoLayerShape(cfg: Record<string, unknown>): Record<string, unknown> {
  const base = normalizeCeoLayerConfig(cfg);
  const out: Record<string, unknown> = { ...base };
  for (const layer of CEO_SKILL_LAYERS) {
    const raw = out[layer];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      out[layer] = { skillIds: [] };
      continue;
    }
    const item = { ...(raw as Record<string, unknown>) };
    if (!Array.isArray(item.skillIds)) {
      item.skillIds = [];
    } else {
      item.skillIds = item.skillIds
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);
    }
    out[layer] = item;
  }
  return out;
}

/**
 * 将商城模板三层合并进公司已持久化的配置：**按层**处理，不扁平成一层。
 * - 非 skillIds 字段：公司以「有实际值的字段」覆盖模板同名字段（管理员已改优先）。
 * - skillIds：模板与公司 **并集**（去重，模板顺序在前），保证模板声明的技能齐全，同时保留公司额外 ID。
 */
export function mergeCeoLayerConfigFromTemplate(
  templateNormalized: Record<string, unknown>,
  companyNormalized: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of CEO_SKILL_LAYERS) {
    const tRaw = templateNormalized[layer];
    const cRaw = companyNormalized[layer];
    const t =
      tRaw && typeof tRaw === 'object' && !Array.isArray(tRaw)
        ? { ...(tRaw as Record<string, unknown>) }
        : {};
    const c =
      cRaw && typeof cRaw === 'object' && !Array.isArray(cRaw) ? (cRaw as Record<string, unknown>) : {};
    const tIds = Array.isArray(t.skillIds)
      ? (t.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const cIds = Array.isArray(c.skillIds)
      ? (c.skillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const merged: Record<string, unknown> = { ...t };
    merged.skillIds = [...new Set([...tIds, ...cIds])];
    for (const [key, cv] of Object.entries(c)) {
      if (key === 'skillIds') continue;
      // 空 keyIds 不应冲掉模板上的池（与 intent/replay 合并策略一致）；显式清空应改模板或运维入口。
      if (
        key === 'keyIds' &&
        Array.isArray(cv) &&
        cv.length === 0 &&
        Array.isArray(t.keyIds) &&
        (t.keyIds as unknown[]).length > 0
      ) {
        continue;
      }
      if (cv === undefined || cv === null) continue;
      if (typeof cv === 'string' && !cv.trim()) continue;
      merged[key] = cv;
    }
    if (Object.keys(merged).length > 0) {
      out[layer] = merged;
    }
  }
  return normalizeCeoLayerConfig(out);
}

/**
 * 合并规则（Worker 面向模板）：
 * - 若某层存在 **仍有效的** 平台全局 skillId，则保留该列表顺序（已预先过滤孤儿 UUID）。
 * - 否则若开启 autoFill 且 recommended 已解析出 ID，则三层统一填入 recommended 解析结果。
 * - 否则该层 skillIds 置空（避免把历史孤儿 UUID 暴露给 Worker）。
 */
export function mergeCeoLayerRuntimeSkillIds(params: {
  baseNormalized: Record<string, unknown>;
  perLayerValidIds: Record<CeoSkillLayer, string[]>;
  recommendedIds: string[];
  autoFillEmptyLayersFromRecommended: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of CEO_SKILL_LAYERS) {
    const prevRaw = params.baseNormalized[layer];
    const prev =
      prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
        ? { ...(prevRaw as Record<string, unknown>) }
        : {};
    const valid = params.perLayerValidIds[layer] ?? [];
    let skillIds: string[];
    if (valid.length > 0) {
      skillIds = valid;
    } else if (
      params.autoFillEmptyLayersFromRecommended &&
      params.recommendedIds.length > 0
    ) {
      skillIds = [...params.recommendedIds];
    } else {
      skillIds = [];
    }
    out[layer] = { ...prev, skillIds };
  }
  return normalizeCeoLayerConfig(out);
}
