import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { BaseEvent } from '@contracts/events';
import { Agent } from '../../agents/entities/agent.entity.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { Task } from '../entities/task.entity.js';
import { TasksService } from './tasks.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

function formatDirectorProgressReportContent(params: {
  period: 'daily' | 'weekly' | 'monthly';
  subordinateCount: number;
  taskSummary: { pending: number; inProgress: number; review: number; completed: number; blocked: number };
}): string {
  const periodLabel =
    params.period === 'daily' ? '日报' : params.period === 'weekly' ? '周报' : '月报';
  const s = params.taskSummary;
  return [
    `【部门${periodLabel}】`,
    `直属下级 ${params.subordinateCount} 人`,
    `任务概况：待办 ${s.pending} · 进行中 ${s.inProgress} · 待审 ${s.review} · 已完成 ${s.completed} · 阻塞 ${s.blocked}`,
  ].join('\n');
}

interface DirectorDelegateInput {
  directorAgentId: string;
  assigneeAgentId: string;
  title: string;
  description?: string;
  successCriteria?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface DirectorReviewInput {
  reviewerAgentId: string;
  qualityScore: number;
  overallAssessment: string;
  approveToProceed: boolean;
  performanceImpact?: string;
}

@Injectable()
export class DirectorManagementService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly messaging: MessagingService,
    private readonly rooms: ChatRoomService,
    private readonly messages: ChatMessageService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  async delegateTask(
    taskId: string,
    input: DirectorDelegateInput,
    actor: Actor,
  ) {
    return this.tasksService.delegateByDirector(taskId, input, actor);
  }

  async submitReview(
    taskId: string,
    input: DirectorReviewInput,
    actor: Actor,
  ) {
    return this.tasksService.submitDirectorReview(taskId, input, actor);
  }

  async reviewBatchApprove(
    taskIds: string[],
    directorAgentId: string,
    actor: Actor,
  ): Promise<{ reviewedTaskIds: string[] }> {
    const reviewedTaskIds: string[] = [];
    for (const taskId of taskIds) {
      await this.tasksService.submitDirectorReview(
        taskId,
        {
          reviewerAgentId: directorAgentId,
          qualityScore: 85,
          overallAssessment: 'good',
          approveToProceed: true,
          performanceImpact: 'positive',
        },
        actor,
      );
      reviewedTaskIds.push(taskId);
    }
    return { reviewedTaskIds };
  }

  async generateProgressReport(
    companyId: string,
    directorAgentId: string,
    period: 'daily' | 'weekly' | 'monthly',
  ): Promise<{
    period: 'daily' | 'weekly' | 'monthly';
    directorAgentId: string;
    roomId: string | null;
    messageId: string | null;
    subordinateCount: number;
    taskSummary: { pending: number; inProgress: number; review: number; completed: number; blocked: number };
  }> {
    const subordinates = await this.agentsRepo.find({
      where: { companyId, reportsToAgentId: directorAgentId },
      select: ['id'],
    });
    const subordinateIds = subordinates.map((x) => x.id);
    const summary = { pending: 0, inProgress: 0, review: 0, completed: 0, blocked: 0 };
    if (subordinateIds.length > 0) {
      const tasks = await this.tasksRepo.find({
        where: subordinateIds.map((id) => ({
          companyId,
          assigneeType: 'agent',
          assigneeId: id,
        })),
      });
      for (const t of tasks) {
        if (t.status === 'pending') summary.pending += 1;
        if (t.status === 'in_progress') summary.inProgress += 1;
        if (t.status === 'review') summary.review += 1;
        if (t.status === 'completed') summary.completed += 1;
        if (t.status === 'blocked') summary.blocked += 1;
      }
    }

    let roomId: string | null = null;
    let messageId: string | null = null;
    const mainRoom = await this.rooms.findMainRoom(companyId);
    if (mainRoom) {
      const report = {
        period,
        generatedAt: new Date().toISOString(),
        subordinateCount: subordinateIds.length,
        taskSummary: summary,
      };
      const msg = await this.messages.appendAgentMessage(
        companyId,
        mainRoom.id,
        directorAgentId,
        formatDirectorProgressReportContent({
          period,
          subordinateCount: subordinateIds.length,
          taskSummary: summary,
        }),
        'system',
        {
          kind: 'director_progress_report',
          source: 'director_management_service',
          reportType: period === 'monthly' ? 'weekly' : period,
          tags: ['reporting', 'performance'],
        },
      );
      roomId = mainRoom.id;
      messageId = msg.id;
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: 'director.progress.reported',
          aggregateId: directorAgentId,
          aggregateType: 'agent',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId,
          data: {
            companyId,
            directorAgentId,
            roomId,
            reportType: period,
            messageId,
          },
        } as BaseEvent,
        { routingKey: 'director.progress.reported', persistent: true },
      );
    }

    await this.messaging.publish(
      {
        eventId: randomUUID(),
        eventType: 'ceo.performance.analyzer.requested',
        aggregateId: directorAgentId,
        aggregateType: 'agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          directorAgentId,
          period,
          subordinateCount: subordinateIds.length,
          taskSummary: summary,
        },
      } as BaseEvent,
      { routingKey: 'ceo.performance.analyzer.requested', persistent: true },
    );

    return {
      period,
      directorAgentId,
      roomId,
      messageId,
      subordinateCount: subordinateIds.length,
      taskSummary: summary,
    };
  }
}
