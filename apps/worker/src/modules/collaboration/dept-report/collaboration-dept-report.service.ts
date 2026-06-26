import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationDirectorDeptReportEvent,
  CollaborationEmployeeDeptReportEvent,
} from '@contracts/events';
import {
  COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY,
  COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY,
  DirectorDeptReportEnvelopeSchema,
  EmployeeDeptReportEnvelopeSchema,
} from '@contracts/events';
import type {
  DeptReportArtifact,
  DeptReportStatus,
  DirectorDeptReportPayload,
  EmployeeDeptReportPayload,
} from '@contracts/types';
import { CollaborationDeptReportBufferService } from './collaboration-dept-report-buffer.service.js';

@Injectable()
export class CollaborationDeptReportService {
  private readonly logger = new Logger(CollaborationDeptReportService.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly buffer: CollaborationDeptReportBufferService,
  ) {}

  async publishEmployeeDeptReport(
    partial: Omit<EmployeeDeptReportPayload, 'version' | 'reportedAt'> & { reportedAt?: string },
  ): Promise<EmployeeDeptReportPayload> {
    const data: EmployeeDeptReportPayload = {
      version: 1,
      ...partial,
      reportedAt: partial.reportedAt ?? new Date().toISOString(),
    };
    EmployeeDeptReportEnvelopeSchema.parse(data);
    await this.buffer.storeEmployeeReport(data);
    const event: CollaborationEmployeeDeptReportEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY,
      aggregateId: data.taskId,
      aggregateType: 'collaboration_dept_report',
      occurredAt: data.reportedAt,
      version: 1,
      companyId: data.companyId,
      data,
    };
    await this.messaging.publish(event, {
      routingKey: COLLABORATION_EMPLOYEE_DEPT_REPORT_ROUTING_KEY,
      persistent: true,
    });
    return data;
  }

  async publishDirectorDeptReport(
    partial: Omit<DirectorDeptReportPayload, 'version' | 'reportedAt'> & { reportedAt?: string },
  ): Promise<DirectorDeptReportPayload> {
    const data: DirectorDeptReportPayload = {
      version: 1,
      ...partial,
      reportedAt: partial.reportedAt ?? new Date().toISOString(),
    };
    DirectorDeptReportEnvelopeSchema.parse(data);
    await this.buffer.storeDirectorReport(data);
    const event: CollaborationDirectorDeptReportEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY,
      aggregateId: `${data.distributionId}:${data.department}`,
      aggregateType: 'collaboration_dept_report',
      occurredAt: data.reportedAt,
      version: 1,
      companyId: data.companyId,
      data,
    };
    await this.messaging.publish(event, {
      routingKey: COLLABORATION_DIRECTOR_DEPT_REPORT_ROUTING_KEY,
      persistent: true,
    });
    return data;
  }

  mapTaskStatusToDeptReport(status: string): DeptReportStatus {
    const s = String(status ?? '').trim().toLowerCase();
    if (s === 'completed') return 'ok';
    if (s === 'blocked') return 'blocked';
    if (s === 'failed' || s === 'cancelled') return 'failed';
    return 'partial';
  }

  artifactsFromUnknown(result: unknown): DeptReportArtifact[] {
    if (!result || typeof result !== 'object') {
      if (typeof result === 'string' && result.trim()) {
        return [{ type: 'text', content: result.slice(0, 4000) }];
      }
      return [];
    }
    const rec = result as Record<string, unknown>;
    if (Array.isArray(rec.artifacts)) {
      return rec.artifacts
        .map((a) => {
          if (!a || typeof a !== 'object') return null;
          const o = a as Record<string, unknown>;
          const type = String(o.type ?? 'unknown').trim() || 'unknown';
          return {
            type,
            uri: typeof o.uri === 'string' ? o.uri : undefined,
            content: typeof o.content === 'string' ? o.content : undefined,
          };
        })
        .filter(Boolean) as DeptReportArtifact[];
    }
    return [{ type: 'json', content: JSON.stringify(result).slice(0, 4000) }];
  }
}
