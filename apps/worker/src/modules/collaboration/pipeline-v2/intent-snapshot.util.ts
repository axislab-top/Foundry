import type { CollaborationIntentDecisionV20261 } from '@contracts/types';

/**
 * 审计 / 发布用 Intent 快照：深拷贝后对外只读语义，避免 listener 与 pipeline 共享可变引用。
 */
export type CollaborationIntentDecisionSnapshotV20261 = Readonly<CollaborationIntentDecisionV20261>;

export function snapshotUnifiedIntentForPublish(
  decision: CollaborationIntentDecisionV20261,
): CollaborationIntentDecisionSnapshotV20261 {
  if (typeof globalThis.structuredClone === 'function') {
    return structuredClone(decision) as CollaborationIntentDecisionSnapshotV20261;
  }
  return JSON.parse(JSON.stringify(decision)) as CollaborationIntentDecisionSnapshotV20261;
}
