import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity.js';
import { MessageActionCandidate } from '../entities/message-action-candidate.entity.js';
import { TaskIntentCandidate } from '../entities/task-intent-candidate.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';

@Injectable()
export class TaskMaterializerService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectRepository(TaskIntentCandidate)
    private readonly taskIntentCandidatesRepo: Repository<TaskIntentCandidate>,
    @InjectRepository(MessageActionCandidate)
    private readonly actionCandidatesRepo: Repository<MessageActionCandidate>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  async materializeReadyCandidate(input: {
    companyId: string;
    candidateId: string;
  }): Promise<{ created: boolean; taskId: string | null; reason: string }> {
    const candidate = await this.taskIntentCandidatesRepo.findOne({
      where: { companyId: input.companyId, id: input.candidateId },
    });
    if (!candidate) return { created: false, taskId: null, reason: 'candidate_not_found' };
    return this.materialize(candidate);
  }

  async materialize(candidate: TaskIntentCandidate): Promise<{ created: boolean; taskId: string | null; reason: string }> {
    if (candidate.createdTaskId) {
      return { created: false, taskId: candidate.createdTaskId, reason: 'already_created' };
    }
    if (candidate.status !== 'ready_to_create') {
      return { created: false, taskId: null, reason: `candidate_not_ready:${candidate.status}` };
    }
    if (!candidate.readiness?.ready) {
      return { created: false, taskId: null, reason: 'readiness_not_ready' };
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(TaskIntentCandidate, {
        where: { id: candidate.id, companyId: candidate.companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) return { created: false, taskId: null, reason: 'candidate_not_found' };
      if (locked.createdTaskId) return { created: false, taskId: locked.createdTaskId, reason: 'already_created' };
      if (locked.status !== 'ready_to_create' || !locked.readiness?.ready) {
        return { created: false, taskId: null, reason: `candidate_not_ready:${locked.status}` };
      }

      const draft = locked.specDraft;
      const task = manager.create(Task, {
        companyId: locked.companyId,
        parentId: null,
        projectId: null,
        title: draft.title ?? '未命名任务',
        description: draft.description ?? null,
        status: 'pending',
        priority: draft.priority ?? 'normal',
        dueDate: draft.dueDate ? new Date(draft.dueDate) : null,
        expectedOutput: draft.expectedOutput ?? null,
        progress: 0,
        assigneeType: draft.assigneeType ?? 'unassigned',
        assigneeId: draft.assigneeId ?? null,
        skillIds: null,
        blockedReason: null,
        requiresHumanApproval: false,
        approvalFlowId: null,
        createdByUserId: null,
        metadata: {
          source: 'task_intent_candidate',
          taskIntentCandidateId: locked.id,
          sourceMessageId: locked.sourceMessageId,
          actionCandidateId: locked.actionCandidateId,
          acceptanceCriteria: draft.acceptanceCriteria,
          reportBackToRoomId: draft.reportBackToRoomId,
        },
      });
      const savedTask = await manager.save(Task, task);

      locked.createdTaskId = savedTask.id;
      locked.status = 'created';
      locked.metadata = {
        ...(locked.metadata ?? {}),
        materializedAt: new Date().toISOString(),
        createdTaskId: savedTask.id,
      };
      await manager.save(TaskIntentCandidate, locked);

      if (locked.actionCandidateId) {
        await manager.update(
          MessageActionCandidate,
          { id: locked.actionCandidateId, companyId: locked.companyId },
          { status: 'executed' },
        );
      }

      await this.patchMessageMetadataInTransaction(manager, locked, savedTask.id);
      return { created: true, taskId: savedTask.id, reason: 'created' };
    });

    return result;
  }

  private async patchMessageMetadataInTransaction(
    manager: EntityManager,
    candidate: TaskIntentCandidate,
    taskId: string,
  ): Promise<void> {
    const taskIntentCandidate = {
      id: candidate.id,
      status: 'created',
      readiness: candidate.readiness,
      taskId,
      updatedAt: new Date().toISOString(),
    };
    const processingStatus = {
      stage: 'task_created',
      mode: 'task_execution',
      status: 'created',
      taskIntentCandidateId: candidate.id,
      taskId,
      updatedAt: new Date().toISOString(),
    };

    await manager
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        metadata: () =>
          `jsonb_set(jsonb_set(COALESCE(metadata, '{}'::jsonb), '{taskIntentCandidate}', :taskIntentCandidate::jsonb, true), '{processingStatus}', :processingStatus::jsonb, true)`,
      })
      .where('id = :messageId AND company_id = :companyId', {
        messageId: candidate.sourceMessageId,
        companyId: candidate.companyId,
      })
      .setParameter('taskIntentCandidate', JSON.stringify(taskIntentCandidate))
      .setParameter('processingStatus', JSON.stringify(processingStatus))
      .execute();
  }
}
