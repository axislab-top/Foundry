/**
 * 部门串行任务编排（`tasks.metadata.deptPipeline`）契约。
 * 与 API `DepartmentTaskPipelineService` / Worker `task.supervision.requested` 对齐。
 */

export const DEPT_PIPELINE_KIND = 'department_sequential_v1' as const;

export type DeptPipelineSupervisionState =
  | 'idle'
  | 'requested'
  | 'passed'
  | 'failed'
  | 'human_required';

export type DeptPipelineChildRole = 'employee_step' | 'cross_department_handoff';

/** 父任务（部门根任务）metadata.deptPipeline */
export type DeptTaskPipelineParentMetadata = {
  kind: typeof DEPT_PIPELINE_KIND;
  departmentOrganizationNodeId: string;
  requireCeoSupervision: boolean;
  supervision: {
    state: DeptPipelineSupervisionState;
    workerRunId?: string;
    decidedAt?: string;
    summary?: string;
    failureReason?: string;
  };
  /** 多部门程序队列：放行后启动下一序号任务 */
  program?: {
    rootProgramTaskId: string;
    sequenceIndex: number;
  };
};

/** 子任务 metadata.pipelineRole / metadata.handoff */
export type DeptPipelineChildMetadata = {
  pipelineRole: DeptPipelineChildRole;
  plannedDistribution?: {
    parentTaskId: string;
    distributionPlanTaskId?: string | null;
    executionProfile?: string | null;
  };
  handoff?: {
    targetOrganizationNodeId: string;
    requestingDirectorAgentId?: string;
    returnSummaryRequired?: boolean;
  };
};
