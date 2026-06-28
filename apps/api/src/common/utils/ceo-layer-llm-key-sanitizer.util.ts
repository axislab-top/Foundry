const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function filterKeyIds(raw: unknown, valid: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? '').trim())
    .filter((id) => UUID_RE.test(id) && valid.has(id));
}

function applyKeyFields(
  layer: Record<string, unknown>,
  valid: ReadonlySet<string>,
): Record<string, unknown> {
  const out = { ...layer };
  const filtered = filterKeyIds(out.keyIds, valid);
  const legacyKid = typeof out.llmKeyId === 'string' ? out.llmKeyId.trim() : '';
  const merged = [...filtered];
  if (legacyKid && UUID_RE.test(legacyKid) && valid.has(legacyKid) && !merged.includes(legacyKid)) {
    merged.unshift(legacyKid);
  }

  if (merged.length > 0) {
    out.keyIds = merged;
    out.llmKeyId = merged[0];
    return out;
  }

  delete out.keyIds;
  delete out.llmKeyId;
  if (out.keySource === 'dedicated') {
    delete out.keySource;
  }
  return out;
}

function sanitizeContextPolicySubLayer(
  layer: unknown,
  valid: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  const base = asRecord(layer);
  if (!base) return undefined;
  const out = applyKeyFields(base, valid);
  const gs = asRecord(out.globalSettings);
  if (gs && Object.prototype.hasOwnProperty.call(gs, 'modelKeyId')) {
    const nextGs = { ...gs };
    const mk = typeof nextGs.modelKeyId === 'string' ? nextGs.modelKeyId.trim() : '';
    if (mk && valid.has(mk)) {
      nextGs.modelKeyId = mk;
    } else {
      delete nextGs.modelKeyId;
    }
    out.globalSettings = nextGs;
  }
  return out;
}

/**
 * 剔除 CEO 层配置 JSON 中指向不存在/不可用 chat Key 的 `keyIds` / `llmKeyId` / `modelKeyId`。
 * 与 Skill 孤儿过滤（{@link SkillRuntimeResolverService}）对齐，避免 Worker 主群路径 acquireById 404。
 */
export function sanitizeCeoLayerConfigLlmKeyIds(
  raw: Record<string, unknown> | null | undefined,
  validActiveChatKeyIds: ReadonlySet<string>,
): Record<string, unknown> {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const valid = validActiveChatKeyIds;
  const out: Record<string, unknown> = { ...input };

  for (const layerName of ['strategy', 'orchestration', 'supervision'] as const) {
    const layer = asRecord(out[layerName]);
    if (layer) {
      out[layerName] = applyKeyFields(layer, valid);
    }
  }

  const strat = asRecord(out.strategy);
  if (strat) {
    const cp = asRecord(strat.contextPolicy);
    if (cp) {
      const nextCp = { ...cp };
      for (const sub of ['intentLayer', 'replay'] as const) {
        const sanitized = sanitizeContextPolicySubLayer(nextCp[sub], valid);
        if (sanitized) {
          nextCp[sub] = sanitized;
        }
      }
      out.strategy = { ...strat, contextPolicy: nextCp };
    }
  }

  return out;
}

/** 收集配置中出现的 LLM Key UUID，供批量校验。 */
export function collectCeoLayerConfigLlmKeyIds(raw: Record<string, unknown> | null | undefined): string[] {
  const ids = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value === 'string') {
      const s = value.trim();
      if (UUID_RE.test(s)) ids.add(s);
    }
  };
  const pushArr = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const x of value) push(x);
  };

  const walkLayer = (layer: unknown) => {
    const obj = asRecord(layer);
    if (!obj) return;
    push(obj.llmKeyId);
    pushArr(obj.keyIds);
    const gs = asRecord(obj.globalSettings);
    if (gs) push(gs.modelKeyId);
  };

  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  for (const name of ['strategy', 'orchestration', 'supervision']) {
    walkLayer((input as Record<string, unknown>)[name]);
  }
  const strat = asRecord((input as Record<string, unknown>).strategy);
  const cp = strat ? asRecord(strat.contextPolicy) : null;
  if (cp) {
    walkLayer(cp.intentLayer);
    walkLayer(cp.replay);
  }
  return [...ids];
}
