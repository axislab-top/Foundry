import {
  buildDepartmentPipelinePhases,
  mergeOrchestrationMetadata,
} from '../pipeline-v2/pipeline-phase-snapshot.util.js';

export function buildDepartmentOrchestrationMetadata(params: {
  status: string;
  stage: string;
  delegationsPublished?: number;
  subGoalCount?: number;
  errorMessage?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const phases = buildDepartmentPipelinePhases({
    orchestrationStatus: params.status,
    stage: params.stage,
    delegationsPublished: params.delegationsPublished ?? 0,
    subGoalCount: params.subGoalCount ?? 0,
  });
  return mergeOrchestrationMetadata(params.extra ?? {}, {
    phases,
    roomType: 'department',
    stage: params.stage,
    delegationsPublished: params.delegationsPublished ?? 0,
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
  });
}
