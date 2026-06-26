import type { DeptReportArtifact } from '@contracts/types';
import { hasMeaningfulDeliverableArtifacts } from './deliverable-gate.service.js';
import type { CollaborationDeliverableArtifactRow } from '../utils/employee-deliverable-artifacts.util.js';

/** L2 子目标（main_room_l2:）默认需要可验收交付物。 */
export function l2SubGoalRequiresDeliverable(metadata: Record<string, unknown> | null | undefined): boolean {
  const gk = String(metadata?.goalDelegationKey ?? '').trim();
  if (!gk.startsWith('main_room_l2:')) return false;
  if (metadata?.requiresDeliverable === false) return false;
  return true;
}

export function deptReportArtifactsToRows(artifacts: DeptReportArtifact[] | undefined): CollaborationDeliverableArtifactRow[] {
  return (artifacts ?? []).map((a) => ({
    type: String(a.type ?? 'artifact').trim() || 'artifact',
    uri: typeof a.uri === 'string' ? a.uri : undefined,
    content: typeof a.content === 'string' ? a.content : undefined,
    fileAssetId: typeof a.fileAssetId === 'string' ? a.fileAssetId : undefined,
    label: typeof a.label === 'string' ? a.label : undefined,
  }));
}

/** 部门汇报是否携带可验收交付物（用于 L2 自动结案 / readyForSupervision）。 */
export function deptReportHasDeliverableArtifacts(artifacts: DeptReportArtifact[] | undefined): boolean {
  return hasMeaningfulDeliverableArtifacts(deptReportArtifactsToRows(artifacts));
}
