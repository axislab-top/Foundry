/**
 * CEO 商城密钥池：按 `ceoContext`（协作层）与 KeyBinding 的 `ceoLayer` 对齐。
 * 独立文件便于单测，且避免与 Nest/合同包形成循环或 ESM 解析问题。
 */

export const CEO_COLLAB_LAYERS = [
  'intent',
  'replay',
  'strategy',
  'orchestration',
  'supervision',
] as const;

export const CEO_LEGACY_AUTONOMOUS_LAYERS = ['classifier', 'light', 'heavy'] as const;

export const CEO_LAYER_ORDER_WHEN_UNSPECIFIED = [
  ...CEO_COLLAB_LAYERS,
  ...CEO_LEGACY_AUTONOMOUS_LAYERS,
] as const;

export function normalizeCeoLayer(raw: unknown): string {
  return String(raw ?? '').trim();
}

export function layerRankForMarketplaceBinding(rawLayer: unknown): number {
  const n = normalizeCeoLayer(rawLayer);
  const order = ['default', ...CEO_LAYER_ORDER_WHEN_UNSPECIFIED];
  const idx = order.indexOf(n);
  return idx >= 0 ? idx : 9;
}

export type MarketplaceKeyBindingLike = { ceoLayer?: unknown; sortOrder: number };

export function sortMarketplaceBindingsByLayer<T extends MarketplaceKeyBindingLike>(bindings: T[]): T[] {
  return [...bindings].sort(
    (a, b) =>
      layerRankForMarketplaceBinding(a.ceoLayer) - layerRankForMarketplaceBinding(b.ceoLayer) ||
      a.sortOrder - b.sortOrder,
  );
}

/**
 * @param safeContext Worker 传入的 `ceoContext`（已 trim）；空串表示未指定，按 `CEO_LAYER_ORDER_WHEN_UNSPECIFIED` 合并各层 binding。
 */
export function selectPoolBindingsForAgent<T extends MarketplaceKeyBindingLike>(params: {
  role: string;
  safeContext: string;
  bindings: T[];
}): T[] {
  const { role, safeContext, bindings } = params;
  const sorted = sortMarketplaceBindingsByLayer(bindings);
  if (role !== 'ceo') {
    return sorted.filter((b) => normalizeCeoLayer(b.ceoLayer) === 'default');
  }
  const isLegacy = (CEO_LEGACY_AUTONOMOUS_LAYERS as readonly string[]).includes(safeContext);
  const isCollabV2 = (CEO_COLLAB_LAYERS as readonly string[]).includes(safeContext);
  if (isLegacy || isCollabV2) {
    return sorted.filter((b) => normalizeCeoLayer(b.ceoLayer) === safeContext);
  }
  return CEO_LAYER_ORDER_WHEN_UNSPECIFIED.flatMap((layer) =>
    sorted.filter((b) => normalizeCeoLayer(b.ceoLayer) === layer),
  );
}

export function isCeoLayerScopedContext(safeContext: string): boolean {
  if (!safeContext) return false;
  return (
    (CEO_LEGACY_AUTONOMOUS_LAYERS as readonly string[]).includes(safeContext) ||
    (CEO_COLLAB_LAYERS as readonly string[]).includes(safeContext)
  );
}

/**
 * CEO 协作层密钥隔离：仅当该层在商城/Admin 下**确有**绑定 key 时才按池过滤。
 * 若某层（如 intent/replay）尚未绑任何 key，`layerPool` 为空，此时仍应允许 agent 行 / assignment 上的 key，
 * 否则 `resolveLlmKeyPoolCandidates` 会对 CEO 恒返回空池并误走全局 acquire。
 */
export function shouldEnforceCeoLayerKeyPool(ceoLayerScoped: boolean, layerPoolSize: number): boolean {
  return ceoLayerScoped && layerPoolSize > 0;
}
