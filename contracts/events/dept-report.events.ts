import { z } from 'zod';
import type { BaseEvent } from './base-event.js';
import type { DirectorDeptReportPayload, EmployeeDeptReportPayload } from '@contracts/types';

export const COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY =
  'collaboration.employee.dept-report' as const;

export const COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY =
  'collaboration.director.dept-report' as const;

export const EmployeeDeptReportEnvelopeSchema = z.object({
  version: z.literal(1),
  companyId: z.string().min(1),
  traceId: z.string().min(1),
  taskId: z.string().min(1),
  parentGoalTaskId: z.string().optional(),
  distributionId: z.string().optional(),
  distributionPlanTaskId: z.string().optional(),
  department: z.string().min(1),
  agentId: z.string().min(1),
  directorAgentId: z.string().optional(),
  roomId: z.string().optional(),
  status: z.enum(['ok', 'partial', 'failed', 'blocked']),
  summary: z.string(),
  artifacts: z
    .array(
      z.object({
        type: z.string(),
        uri: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  blockers: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reportedAt: z.string().min(1),
});

export const DirectorDeptReportEnvelopeSchema = z.object({
  version: z.literal(1),
  companyId: z.string().min(1),
  traceId: z.string().min(1),
  distributionId: z.string().min(1),
  department: z.string().min(1),
  directorAgentId: z.string().min(1),
  parentGoalTaskId: z.string().optional(),
  status: z.enum(['ok', 'partial', 'failed', 'blocked']),
  summary: z.string(),
  readyForSupervision: z.boolean(),
  employeeReports: z.array(
    z.object({
      taskId: z.string(),
      agentId: z.string(),
      status: z.enum(['ok', 'partial', 'failed', 'blocked']),
      summary: z.string(),
      artifactTypes: z.array(z.string()).optional(),
    }),
  ),
  artifacts: z
    .array(
      z.object({
        type: z.string(),
        uri: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  blockers: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reportedAt: z.string().min(1),
});

export interface CollaborationEmployeeDeptReportEvent extends BaseEvent {
  eventType: typeof COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY;
  aggregateType: 'collaboration_dept_report';
  data: EmployeeDeptReportPayload;
}

export interface CollaborationDirectorDeptReportEvent extends BaseEvent {
  eventType: typeof COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY;
  aggregateType: 'collaboration_dept_report';
  data: DirectorDeptReportPayload;
}

export type DeptReportEvent =
  | CollaborationEmployeeDeptReportEvent
  | CollaborationDirectorDeptReportEvent;

export interface DeptReportEventTopics {
  [COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY]: CollaborationEmployeeDeptReportEvent;
  [COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY]: CollaborationDirectorDeptReportEvent;
}
