import { Injectable } from '@nestjs/common';
import type { CollaborationDeliverableArtifactRow } from '../utils/employee-deliverable-artifacts.util.js';
import { isBlockedSkillArtifactContent, isIncompleteSkillPlaceholderContent } from '../utils/skill-execution-outcome.util.js';

export interface DeliverableGateInput {
  artifacts: CollaborationDeliverableArtifactRow[];
  taskId?: string;
  requiresDeliverable: boolean;
}

export type DeliverableGateBlockReason = 'no_artifacts';

export interface DeliverableGateResult {
  allowed: boolean;
  reason?: DeliverableGateBlockReason | 'not_required';
}

/** strict：无有效 artifact 则不得标记完成。 */
export function hasMeaningfulDeliverableArtifacts(
  artifacts: CollaborationDeliverableArtifactRow[],
): boolean {
  return artifacts.some((a) => {
    if (String(a.fileAssetId ?? '').trim()) return true;
    const uri = String(a.uri ?? '').trim();
    if (uri) return true;
    const content = String(a.content ?? '').trim();
    if (!content) return false;
    if (content === '{}' || content === 'null' || content === '""') return false;
    if (isBlockedSkillArtifactContent(content)) return false;
    if (isIncompleteSkillPlaceholderContent(content)) return false;
    return true;
  });
}

@Injectable()
export class DeliverableGateService {
  evaluate(input: DeliverableGateInput): DeliverableGateResult {
    if (!input.requiresDeliverable) {
      return { allowed: true, reason: 'not_required' };
    }
    if (!hasMeaningfulDeliverableArtifacts(input.artifacts)) {
      return { allowed: false, reason: 'no_artifacts' };
    }
    return { allowed: true };
  }
}
