import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity.js';
import { ChatRoom } from '../entities/chat-room.entity.js';
import { MessageActionCandidate } from '../entities/message-action-candidate.entity.js';
import { ReplayDecision } from '../entities/replay-decision.entity.js';
import { TaskIntentCandidate } from '../entities/task-intent-candidate.entity.js';
import { TaskIntentCandidateService } from '../services/task-intent-candidate.service.js';
import { TaskMaterializerService } from './task-materializer.service.js';

@Injectable()
export class ExecutionIntakeService {
  constructor(
    private readonly taskIntentCandidates: TaskIntentCandidateService,
    private readonly taskMaterializer: TaskMaterializerService,
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
  ) {}

  async intakeReplayDecision(input: {
    companyId: string;
    message: ChatMessage;
    replayDecision: ReplayDecision;
    actionCandidate?: MessageActionCandidate | null;
  }): Promise<TaskIntentCandidate | null> {
    if (!this.isExecutionReplayKind(input.replayDecision.kind)) {
      return null;
    }

    const room = await this.roomsRepo.findOne({
      where: { companyId: input.companyId, id: input.message.roomId },
    });
    const isMainRoom = String(room?.roomType ?? '').trim() === 'main';
    const workerDriven =
      input.replayDecision.source === 'worker_main_room_replay' ||
      (input.replayDecision.metadata &&
        typeof input.replayDecision.metadata === 'object' &&
        (input.replayDecision.metadata as Record<string, unknown>).recordedBy === 'WorkerReplaySsot');
    if (isMainRoom && workerDriven) {
      const orchestrationReplayKinds = new Set([
        'confirm_execution',
        'propose_execution',
        'dispatch_to_departments',
      ]);
      if (orchestrationReplayKinds.has(input.replayDecision.kind)) {
        return null;
      }
    }
    if (isMainRoom && !workerDriven) {
      return null;
    }

    const candidate =
      input.replayDecision.kind === 'confirm_execution'
        ? await this.confirmLatestAwaitingCandidate(input)
        : await this.taskIntentCandidates.draftFromReplayDecision({
            companyId: input.companyId,
            roomId: input.message.roomId,
            message: input.message,
            replayDecision: input.replayDecision,
            actionCandidate: input.actionCandidate ?? null,
          });

    if (!candidate) {
      return null;
    }

    await this.patchExecutionIntakeStatus(input.companyId, input.message.id, candidate);
    if (candidate.status === 'ready_to_create') {
      await this.taskMaterializer.materialize(candidate);
    }
    return candidate;
  }

  private async confirmLatestAwaitingCandidate(input: {
    companyId: string;
    message: ChatMessage;
    replayDecision: ReplayDecision;
    actionCandidate?: MessageActionCandidate | null;
  }): Promise<TaskIntentCandidate | null> {
    const awaiting = await this.taskIntentCandidates.findLatestAwaitingConfirmation({
      companyId: input.companyId,
      roomId: input.message.roomId,
    });
    if (!awaiting) {
      return this.taskIntentCandidates.draftFromReplayDecision({
        companyId: input.companyId,
        roomId: input.message.roomId,
        message: input.message,
        replayDecision: input.replayDecision,
        actionCandidate: input.actionCandidate ?? null,
      });
    }
    return this.taskIntentCandidates.markReadyAfterConfirmation({
      candidate: awaiting,
      confirmationMessageId: input.message.id,
      replayDecisionId: input.replayDecision.id,
      actionCandidateId: input.actionCandidate?.id ?? null,
    });
  }

  private isExecutionReplayKind(kind: ReplayDecision['kind']): boolean {
    return kind === 'prepare_task_draft' || kind === 'confirm_execution';
  }

  private async patchExecutionIntakeStatus(
    companyId: string,
    messageId: string,
    candidate: TaskIntentCandidate,
  ): Promise<void> {
    await this.messagesRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        metadata: () => `
          jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{taskIntentCandidate}', :taskIntentCandidate::jsonb, true),
            '{processingStatus}',
            :processingStatus::jsonb,
            true
          )
        `,
      })
      .where('id = :messageId AND company_id = :companyId', { messageId, companyId })
      .setParameter(
        'taskIntentCandidate',
        JSON.stringify({
          id: candidate.id,
          status: candidate.status,
          readiness: candidate.readiness,
          updatedAt: new Date().toISOString(),
        }),
      )
      .setParameter(
        'processingStatus',
        JSON.stringify({
          stage: 'execution_intake',
          mode: 'task_execution',
          status: candidate.status,
          taskIntentCandidateId: candidate.id,
          clarificationPrompt: candidate.readiness.clarificationPrompt,
          missingFields: candidate.readiness.missingFields,
          updatedAt: new Date().toISOString(),
        }),
      )
      .execute();
  }
}
