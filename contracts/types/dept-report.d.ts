/**
 * 部门层级汇报契约（员工 → 主管 → Supervision）。
 * 与 {@link EmployeeExecutionResult} artifact 形状对齐，避免第三套结构。
 */
export type DeptReportStatus = 'ok' | 'partial' | 'failed' | 'blocked';
export interface DeptReportArtifact {
    type: string;
    uri?: string;
    content?: string;
}
/** 员工向部门主管汇报（单条子任务 / 委派任务）。 */
export interface EmployeeDeptReportPayload {
    version: 1;
    companyId: string;
    traceId: string;
    taskId: string;
    parentGoalTaskId?: string;
    distributionId?: string;
    distributionPlanTaskId?: string;
    department: string;
    agentId: string;
    directorAgentId?: string;
    roomId?: string;
    status: DeptReportStatus;
    summary: string;
    artifacts?: DeptReportArtifact[];
    blockers?: string[];
    metadata?: Record<string, unknown>;
    reportedAt: string;
}
/** 部门主管向 Supervision 汇报（部门维度聚合）。 */
export interface DirectorDeptReportPayload {
    version: 1;
    companyId: string;
    traceId: string;
    distributionId: string;
    department: string;
    directorAgentId: string;
    parentGoalTaskId?: string;
    status: DeptReportStatus;
    summary: string;
    readyForSupervision: boolean;
    employeeReports: Array<{
        taskId: string;
        agentId: string;
        status: DeptReportStatus;
        summary: string;
        artifactTypes?: string[];
    }>;
    artifacts?: DeptReportArtifact[];
    blockers?: string[];
    metadata?: Record<string, unknown>;
    reportedAt: string;
}
//# sourceMappingURL=dept-report.d.ts.map