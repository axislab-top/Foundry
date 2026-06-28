import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentSkillService } from '../../agents/services/agent-skill.service.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import type { BaseEvent } from '@contracts/events';
import { DirectorManagementService } from './director-management.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { Task } from '../entities/task.entity.js';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TasksService } from './tasks.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class DirectorManagementFacadeService {
  constructor(
    private readonly directorManagement: DirectorManagementService,
    private readonly tasksService: TasksService,
    private readonly agentSkillService: AgentSkillService,
    private readonly skillsService: SkillsService,
    private readonly messaging: MessagingService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  private async assertAgentHasSkills(
    companyId: string,
    agentId: string,
    requiredSkillNames: string[],
    errorMessage: string,
  ): Promise<void> {
    const requiredSkillIds = await this.skillsService.findGlobalSkillIdsByNames(requiredSkillNames);
    if (requiredSkillIds.length === 0) return;
    for (const sid of requiredSkillIds) {
      await this.skillsService.assertSkillUsableByTenant(sid, companyId);
    }
    const boundSkillIds = await this.agentSkillService.listSkillIdsForAgent(agentId, companyId);
    const boundSet = new Set(boundSkillIds);
    const missing = requiredSkillIds.filter((id) => !boundSet.has(id));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: errorMessage,
      });
    }
  }

  private async assertDirectorHasSkills(
    companyId: string,
    directorAgentId: string,
    requiredSkillNames: string[],
  ): Promise<void> {
    await this.assertAgentHasSkills(
      companyId,
      directorAgentId,
      requiredSkillNames,
      '主管缺少必需管理技能，无法执行该操作',
    );
  }

  private async assertCeoHasSkills(
    companyId: string,
    ceoAgentId: string,
    requiredSkillNames: string[],
  ): Promise<void> {
    await this.assertAgentHasSkills(
      companyId,
      ceoAgentId,
      requiredSkillNames,
      'CEO 缺少必需战略技能，无法执行该操作',
    );
  }

  private async assertCeoCanDelegateToDirector(
    companyId: string,
    ceoAgentId: string,
    directorAgentId: string,
  ): Promise<void> {
    const [ceo, director] = await Promise.all([
      this.agentsRepo.findOne({ where: { id: ceoAgentId, companyId, role: 'ceo' } }),
      this.agentsRepo.findOne({ where: { id: directorAgentId, companyId, role: 'director' } }),
    ]);
    if (!ceo || !director) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'CEO 或 Director 不存在',
      });
    }
    if (director.reportsToAgentId && director.reportsToAgentId !== ceo.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅允许委派给直属 Director',
      });
    }
  }

  private async assertDirectReport(companyId: string, directorAgentId: string, subordinateAgentId: string): Promise<void> {
    const subordinate = await this.agentsRepo.findOne({ where: { id: subordinateAgentId, companyId } });
    if (!subordinate) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '下属 Agent 不存在' });
    }
    if (subordinate.reportsToAgentId && subordinate.reportsToAgentId !== directorAgentId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '仅允许操作直属下属' });
    }
  }

  private async emitSkillExecuted(companyId: string, agentId: string, skillName: string, traceId: string, argsSummary: Record<string, unknown> | null, resultSummary: Record<string, unknown> | null) {
    const [skillId] = await this.skillsService.findGlobalSkillIdsByNames([skillName]);
    await this.messaging.publish(
      {
        eventId: randomUUID(),
        eventType: 'skill.executed',
        aggregateId: skillId ?? skillName,
        aggregateType: 'skill',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          agentId,
          skillId: skillId ?? null,
          skillName,
          traceId,
          argsSummary,
          resultSummary,
          durationMs: null,
          billingUnits: null,
          executedAt: new Date().toISOString(),
        },
      } as BaseEvent,
      { routingKey: 'skill.executed', persistent: true },
    );
  }

  async delegateTask(
    companyId: string,
    taskId: string,
    input: Parameters<DirectorManagementService['delegateTask']>[1],
    actor: Actor,
  ) {
    const traceId = randomUUID();
    await this.assertDirectorHasSkills(companyId, input.directorAgentId, ['director-task-delegator']);
    await this.assertDirectReport(companyId, input.directorAgentId, input.assigneeAgentId);
    const res = await this.directorManagement.delegateTask(taskId, input, actor);
    await this.emitSkillExecuted(
      companyId,
      input.directorAgentId,
      'director-task-delegator',
      traceId,
      { taskId, assigneeAgentId: input.assigneeAgentId, title: input.title },
      { delegatedTaskId: (res as any)?.id ?? null },
    );
    return res;
  }

  async delegateFromCeo(
    companyId: string,
    input: {
      ceoAgentId: string;
      directorAgentId: string;
      title: string;
      description?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      requiresHumanApproval?: boolean;
      traceId?: string;
      source?: string;
    },
    actor: Actor,
  ) {
    const traceId = input.traceId || randomUUID();
    await this.assertCeoHasSkills(companyId, input.ceoAgentId, [
      'ceo-strategic-breakdown',
      'ceo-task-assigner',
    ]);
    await this.assertCeoCanDelegateToDirector(companyId, input.ceoAgentId, input.directorAgentId);
    const created = await this.tasksService.create(
      {
        title: input.title,
        description: input.description ?? '',
        priority: input.priority ?? 'normal',
        assigneeType: 'agent',
        assigneeId: input.directorAgentId,
        requiresHumanApproval: input.requiresHumanApproval ?? false,
        metadata: {
          ceoAgentId: input.ceoAgentId,
          traceId,
          source: input.source ?? 'ceo-task-assigner',
        },
      } as any,
      actor,
      { source: 'autonomous', trustedInternal: true },
    );
    await this.emitSkillExecuted(
      companyId,
      input.ceoAgentId,
      'ceo-strategic-breakdown',
      traceId,
      { title: input.title, directorAgentId: input.directorAgentId },
      { taskId: (created as any)?.id ?? null },
    );
    await this.emitSkillExecuted(
      companyId,
      input.ceoAgentId,
      'ceo-task-assigner',
      traceId,
      { title: input.title, directorAgentId: input.directorAgentId },
      { taskId: (created as any)?.id ?? null },
    );
    return created;
  }

  async submitReview(
    companyId: string,
    taskId: string,
    input: Parameters<DirectorManagementService['submitReview']>[1],
    actor: Actor,
  ) {
    const traceId = randomUUID();
    await this.assertDirectorHasSkills(companyId, input.reviewerAgentId, [
      'director-subordinate-reviewer',
      'director-team-performance-coach',
    ]);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } as any });
    if (!task || task.assigneeType !== 'agent' || !task.assigneeId) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在或不可审查' });
    }
    await this.assertDirectReport(companyId, input.reviewerAgentId, task.assigneeId);
    const res = await this.directorManagement.submitReview(taskId, input, actor);
    await this.emitSkillExecuted(
      companyId,
      input.reviewerAgentId,
      'director-subordinate-reviewer',
      traceId,
      { taskId, assigneeAgentId: task.assigneeId, qualityScore: input.qualityScore, overallAssessment: input.overallAssessment },
      { ok: true },
    );
    return res;
  }

  async reviewBatchApprove(
    companyId: string,
    taskIds: string[],
    directorAgentId: string,
    actor: Actor,
  ) {
    const traceId = randomUUID();
    await this.assertDirectorHasSkills(companyId, directorAgentId, [
      'director-subordinate-reviewer',
      'director-team-performance-coach',
    ]);
    const res = await this.directorManagement.reviewBatchApprove(taskIds, directorAgentId, actor);
    await this.emitSkillExecuted(
      companyId,
      directorAgentId,
      'director-team-performance-coach',
      traceId,
      { taskIds, mode: 'batch_approve' },
      { reviewedTaskIds: (res as any)?.reviewedTaskIds ?? [] },
    );
    return res;
  }

  async generateProgressReport(
    companyId: string,
    directorAgentId: string,
    period: 'daily' | 'weekly' | 'monthly',
  ) {
    const traceId = randomUUID();
    await this.assertDirectorHasSkills(companyId, directorAgentId, ['director-progress-reporter']);
    const res = await this.directorManagement.generateProgressReport(companyId, directorAgentId, period);
    await this.emitSkillExecuted(
      companyId,
      directorAgentId,
      'director-progress-reporter',
      traceId,
      { period },
      { roomId: (res as any)?.roomId ?? null, messageId: (res as any)?.messageId ?? null },
    );
    return res;
  }
}
