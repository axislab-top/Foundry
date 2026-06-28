import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { TaskIntentCandidateService } from '../services/task-intent-candidate.service.js';
import { TaskMaterializerService } from './task-materializer.service.js';
import type { ActorRef } from '../../../common/types/user.types.js';
import type { TaskSpecDraft } from '../entities/task-intent-candidate.entity.js';

@Injectable()
export class TaskIntentWorkflowService {
  constructor(
    private readonly roomMembers: RoomMemberService,
    private readonly candidates: TaskIntentCandidateService,
    private readonly materializer: TaskMaterializerService,
  ) {}

  async patchSpec(input: {
    companyId: string;
    actor: ActorRef;
    candidateId: string;
    patch: Partial<TaskSpecDraft>;
  }) {
    const candidate = await this.candidates.findById(input.companyId, input.candidateId);
    if (!candidate) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务候选不存在' });
    }
    await this.assertCanOperate(input.companyId, candidate.roomId, input.actor);
    if (candidate.status === 'created' || candidate.createdTaskId) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '任务已创建，不能继续修改候选' });
    }
    const patched = await this.candidates.patchSpecDraft({
      candidate,
      patch: this.sanitizePatch(input.patch),
      patchedByUserId: input.actor.id,
    });
    const materializeResult =
      patched.status === 'ready_to_create'
        ? await this.materializer.materialize(patched)
        : { created: false, taskId: null, reason: `candidate_not_ready:${patched.status}` };
    return { candidate: patched, materializeResult };
  }

  async confirm(input: {
    companyId: string;
    actor: ActorRef;
    candidateId: string;
  }) {
    const candidate = await this.candidates.findById(input.companyId, input.candidateId);
    if (!candidate) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务候选不存在' });
    }
    await this.assertCanOperate(input.companyId, candidate.roomId, input.actor);
    if (candidate.status === 'created' || candidate.createdTaskId) {
      return {
        candidate,
        materializeResult: { created: false, taskId: candidate.createdTaskId, reason: 'already_created' },
      };
    }
    if (candidate.status === 'needs_clarification' && !candidate.readiness.ready) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '任务候选信息不足，需先补充字段',
      });
    }
    const ready = await this.candidates.markReadyAfterConfirmation({
      candidate,
      confirmationMessageId: candidate.sourceMessageId,
      replayDecisionId: 'manual-confirmation',
    });
    const materializeResult = await this.materializer.materialize(ready);
    return { candidate: ready, materializeResult };
  }

  private async assertCanOperate(companyId: string, roomId: string, actor: ActorRef): Promise<void> {
    if (actor.roles?.includes('admin')) return;
    const allowed = await this.roomMembers.isActiveMember(companyId, roomId, 'human', actor.id);
    if (!allowed) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '无权操作该任务候选' });
    }
  }

  private sanitizePatch(patch: Partial<TaskSpecDraft>): Partial<TaskSpecDraft> {
    return {
      ...(typeof patch.title === 'string' ? { title: patch.title.trim().slice(0, 512) || null } : {}),
      ...(typeof patch.description === 'string' ? { description: patch.description.trim() || null } : {}),
      ...(patch.priority === 'low' || patch.priority === 'normal' || patch.priority === 'high' || patch.priority === 'urgent'
        ? { priority: patch.priority }
        : {}),
      ...(typeof patch.dueDate === 'string' ? { dueDate: patch.dueDate } : {}),
      ...(typeof patch.expectedOutput === 'string' ? { expectedOutput: patch.expectedOutput.trim() || null } : {}),
      ...(patch.assigneeType === 'agent' || patch.assigneeType === 'organization_node' || patch.assigneeType === 'unassigned'
        ? { assigneeType: patch.assigneeType }
        : {}),
      ...(typeof patch.assigneeId === 'string' ? { assigneeId: patch.assigneeId } : {}),
      ...(Array.isArray(patch.acceptanceCriteria) ? { acceptanceCriteria: patch.acceptanceCriteria } : {}),
    };
  }
}
