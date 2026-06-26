import { describe, expect, it } from 'vitest';
import {
  DirectorDeptReportEnvelopeSchema,
  EmployeeDeptReportEnvelopeSchema,
} from './dept-report.events.js';

describe('dept-report events', () => {
  it('parses employee dept report envelope', () => {
    const parsed = EmployeeDeptReportEnvelopeSchema.parse({
      version: 1,
      companyId: 'c1',
      traceId: 't1',
      taskId: 'task1',
      department: 'marketing',
      agentId: 'a1',
      status: 'ok',
      summary: 'done',
      reportedAt: new Date().toISOString(),
    });
    expect(parsed.department).toBe('marketing');
  });

  it('parses director dept report envelope', () => {
    const parsed = DirectorDeptReportEnvelopeSchema.parse({
      version: 1,
      companyId: 'c1',
      traceId: 't1',
      distributionId: 'dist1',
      department: 'marketing',
      directorAgentId: 'dir1',
      status: 'ok',
      summary: 'dept ok',
      readyForSupervision: true,
      employeeReports: [],
      reportedAt: new Date().toISOString(),
    });
    expect(parsed.readyForSupervision).toBe(true);
  });
});
