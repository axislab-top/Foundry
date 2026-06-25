/**
 * Intent Rule Studio / 读路径归一（运行时）。
 * 实现放在 `@contracts/types`，避免依赖 `@foundry/contracts` 未构建的 dist。
 */
import {
  COLLABORATION_INTENT_TYPES_2026,
  type CollaborationIntentType2026,
} from '@foundry/contracts/types/collaboration-2026';

/** 旧 Rule Studio / L1 分类器存盘 token → 2026 枚举。 */
const LEGACY_INTENT_TYPE_ALIASES: Record<string, CollaborationIntentType2026> = {
  quick: 'ceo_reply',
  casual: 'ceo_reply',
  simple_query: 'ceo_reply',
  heavy: 'orchestration',
  complex: 'orchestration',
  multi_dept: 'orchestration',
  governance: 'approval',
  direct_agent: 'direct_summon',
  direct_group: 'direct_summon',
};

/**
 * Rule Studio / 平台规则 JSON / 旧日志中的 intentType 归一为 2026 枚举。
 */
export function coerceIntentRuleTypeTo2026(raw: unknown): CollaborationIntentType2026 {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!s) return 'unknown';
  if ((COLLABORATION_INTENT_TYPES_2026 as readonly string[]).includes(s)) {
    return s as CollaborationIntentType2026;
  }
  return LEGACY_INTENT_TYPE_ALIASES[s] ?? 'audience_resolution';
}

/** CEO replay / 编排「自然对话」轻量模式（仅 ceo_reply）。 */
export function isNaturalConversationIntentType(raw: unknown): boolean {
  return coerceIntentRuleTypeTo2026(raw) === 'ceo_reply';
}
