import { Injectable, Logger } from '@nestjs/common';
import type {
  CollaborationProgramPhase,
  CollaborationProgramRecord,
} from '@contracts/types';
import { canTransitionProgramPhase } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationProgramClientService } from './collaboration-program-client.service.js';
import { CollaborationProgramTimelineService } from './collaboration-program-timeline.service.js';
/** @stub Local type for deleted work-intent.types module. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkCommand = any;
import {
  planPhaseAfterDispatchFlush,
  planPhaseAfterPlanGenerated,
  planProgramSyncForWorkCommand,
} from './program-work-command-sync.util.js';

@Injectable()
export class CollaborationProgramLifecycleService {
  private readonly logger = new Logger(CollaborationProgramLifecycleService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly programClient: CollaborationProgramClientService,
    private readonly programTimeline: CollaborationProgramTimelineService,
  ) {}

  isEnabled(): boolean {
    return this.config.isCollabProgramSsotEnabled() && this.programTimeline.isEnabled();
  }

  /** Replay/Dispatch 路径：无 open program 时创建 intake 并推进到可 planning 态。 */
  async ensureOpenForDispatch(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    sourceMessageId: string;
    traceId?: string | null;
    goalSummary?: string | null;
  }): Promise<CollaborationProgramRecord | null> {
    if (!this.isEnabled()) return null;
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    const sourceMessageId = String(params.sourceMessageId ?? '').trim();
    if (!companyId || !roomId || !sourceMessageId) return null;

    let program = await this.programClient.getActive({ companyId, roomId, threadId: params.threadId });
    if (program) return program;

    const goal = String(params.goalSummary ?? '').trim();
    program = await this.programClient.createIntake({
      companyId,
      roomId,
      threadId: params.threadId,
      sourceMessageId,
      brief: goal ? { deliverableType: 'deliverable', title: goal.slice(0, 200) } : undefined,
      metadata: {
        traceId: params.traceId ?? null,
        openedBy: 'dispatch_plan_replay',
      },
    });

    if (canTransitionProgramPhase(program.phase, 'ready_to_plan')) {
      program = await this.safeTransition({
        companyId,
        programId: program.id,
        fromPhase: program.phase,
        toPhase: 'ready_to_plan',
        traceId: params.traceId,
      });
    }
    return program;
  }

  /** Compiler 产出 work command 后同步 phase + timeline。 */
  async syncWorkCommand(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    sourceMessageId: string;
    traceId?: string | null;
    command: WorkCommand;
    existingProgram?: CollaborationProgramRecord | null;
  }): Promise<CollaborationProgramRecord | null> {
    if (!this.isEnabled()) return params.existingProgram ?? null;

    const plan = planProgramSyncForWorkCommand({
      command: params.command,
      program: params.existingProgram ?? null,
      traceId: params.traceId,
    });
    if (!plan) return params.existingProgram ?? null;

    let program = params.existingProgram ?? null;
    if (
      params.command.kind === 'dispatch_plan' ||
      params.command.kind === 'flush_pending' ||
      params.command.kind === 'aligning'
    ) {
      const goal =
        params.command.kind === 'dispatch_plan'
          ? params.command.goalSummary
          : params.command.kind === 'flush_pending'
            ? params.command.goalSummary
            : null;
      program =
        program ??
        (await this.ensureOpenForDispatch({
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId,
          sourceMessageId: params.sourceMessageId,
          traceId: params.traceId,
          goalSummary: goal,
        }));
    }

    if (!program) return null;

    if (plan.toPhase && canTransitionProgramPhase(program.phase, plan.toPhase)) {
      program = await this.safeTransition({
        companyId: params.companyId,
        programId: program.id,
        fromPhase: program.phase,
        toPhase: plan.toPhase,
        traceId: params.traceId,
        patch:
          plan.toPhase === 'planning' || plan.toPhase === 'ready_to_plan'
            ? {
                goalUnderstanding:
                  params.command.kind === 'dispatch_plan' && params.command.goalSummary
                    ? {
                        summary: params.command.goalSummary.slice(0, 2000),
                        readiness: 'ready',
                        source: 'llm_turn' as const,
                      }
                    : undefined,
              }
            : undefined,
      });
    }

    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: plan.timelineKind,
      summary: plan.summary,
      traceId: params.traceId,
      metadata: plan.metadata,
    });

    return program;
  }

  async onPlanGenerated(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    planRevision: number;
    planId: string;
    assignmentCount: number;
    pendingDistributionConfirm: boolean;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;

    const toPhase = planPhaseAfterPlanGenerated({
      programPhase: program.phase,
      pendingDistributionConfirm: params.pendingDistributionConfirm,
    });
    let current = program;
    if (toPhase && canTransitionProgramPhase(program.phase, toPhase)) {
      current = await this.safeTransition({
        companyId: params.companyId,
        programId: program.id,
        fromPhase: program.phase,
        toPhase,
        traceId: params.traceId,
        patch: {
          dispatch: {
            planRevision: params.planRevision,
            pendingDistributionConfirm: params.pendingDistributionConfirm,
          },
        },
      });
    }

    await this.programTimeline.append({
      companyId: params.companyId,
      programId: current.id,
      phase: current.phase,
      kind: 'plan_generated',
      summary: `已生成执行计划（共 ${params.assignmentCount} 个部门分工）。`,
      traceId: params.traceId,
      metadata: { planRevision: params.planRevision, planId: params.planId },
    });
  }

  async onDispatchFlushed(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    assignedCount: number;
    planId?: string | null;
    distributionId?: string | null;
    flushDurationMs?: number;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;

    const toPhase = planPhaseAfterDispatchFlush(program.phase);
    let current = program;
    if (toPhase) {
      if (canTransitionProgramPhase(program.phase, 'dispatching') && program.phase !== 'dispatching') {
        current = await this.safeTransition({
          companyId: params.companyId,
          programId: program.id,
          fromPhase: program.phase,
          toPhase: 'dispatching',
          traceId: params.traceId,
        });
      }
      if (canTransitionProgramPhase(current.phase, 'dept_executing')) {
        current = await this.safeTransition({
          companyId: params.companyId,
          programId: current.id,
          fromPhase: current.phase,
          toPhase: 'dept_executing',
          traceId: params.traceId,
          patch: { dispatch: { pendingDistributionConfirm: false } },
        });
      }
    }

    await this.programTimeline.append({
      companyId: params.companyId,
      programId: current.id,
      phase: current.phase,
      kind: 'dispatch_flushed',
      summary: `已下发执行计划（${params.assignedCount} 个部门收到派活）。`,
      traceId: params.traceId,
      metadata: {
        planId: params.planId ?? null,
        distributionId: params.distributionId ?? null,
        flushDurationMs: params.flushDurationMs ?? null,
      },
    });

    if (typeof params.flushDurationMs === 'number' && params.flushDurationMs >= 0) {
      this.logger.log('foundry.collaboration.dispatch.flush_to_dept_sla', {
        companyId: params.companyId,
        roomId: params.roomId,
        programId: current.id,
        traceId: params.traceId ?? null,
        flushDurationMs: params.flushDurationMs,
        assignedCount: params.assignedCount,
      });
    }
  }

  async onDeptAck(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    deptLabel: string;
    taskTitle: string;
    subGoalTaskId: string;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;
    const dept = String(params.deptLabel ?? '').trim() || '部门';
    const title = String(params.taskTitle ?? '').trim() || '任务';
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: 'dept_ack',
      summary: `${dept} 主管已接单：${title.slice(0, 80)}`,
      traceId: params.traceId,
      metadata: { subGoalTaskId: params.subGoalTaskId },
    });
  }

  async onCompensation(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    headline: string;
    scopeKey: string;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: 'compensation',
      summary: params.headline.slice(0, 200),
      traceId: params.traceId,
      metadata: { scopeKey: params.scopeKey },
    });
  }

  async onEmployeeReport(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    deptLabel: string;
    summary: string;
    distributionId?: string | null;
    status?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;
    const dept = String(params.deptLabel ?? '').trim() || '部门';
    const line = String(params.summary ?? '').trim().slice(0, 120);
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: 'employee_report',
      summary: line ? `${dept} 员工汇报：${line}` : `${dept} 员工已提交阶段汇报`,
      traceId: params.traceId,
      metadata: {
        distributionId: params.distributionId ?? null,
        status: params.status ?? null,
      },
    });
  }

  async onDirectorDeptProgress(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    deptLabel: string;
    summary: string;
    distributionId?: string | null;
    status?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;
    const dept = String(params.deptLabel ?? '').trim() || '部门';
    const line = String(params.summary ?? '').trim().slice(0, 120);
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: 'employee_report',
      summary: line ? `${dept} 阶段进展：${line}` : `${dept} 已提交阶段汇报`,
      traceId: params.traceId,
      metadata: {
        distributionId: params.distributionId ?? null,
        status: params.status ?? null,
        source: 'director_dept_report',
      },
    });
  }

  async onQcRework(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    deptLabel: string;
    reason: string;
    distributionId?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;
    const dept = String(params.deptLabel ?? '').trim() || '部门';
    const reason = String(params.reason ?? '').trim().slice(0, 120);
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: program.id,
      phase: program.phase,
      kind: 'qc_rework',
      summary: `${dept} 质检返工：${reason || '交付物未通过验收'}`,
      traceId: params.traceId,
      metadata: { distributionId: params.distributionId ?? null },
    });
  }

  async onSupervisionComplete(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    distributionId?: string | null;
    parentGoalTaskId?: string | null;
    completedDeptCount?: number;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;

    let current = program;
    if (canTransitionProgramPhase(program.phase, 'supervising')) {
      current = await this.safeTransition({
        companyId: params.companyId,
        programId: program.id,
        fromPhase: program.phase,
        toPhase: 'supervising',
        traceId: params.traceId,
      });
    }
    if (canTransitionProgramPhase(current.phase, 'delivered')) {
      current = await this.safeTransition({
        companyId: params.companyId,
        programId: current.id,
        fromPhase: current.phase,
        toPhase: 'delivered',
        traceId: params.traceId,
      });
    }

    const n = params.completedDeptCount ?? 0;
    await this.programTimeline.append({
      companyId: params.companyId,
      programId: current.id,
      phase: current.phase,
      kind: 'supervision_complete',
      summary: n > 0 ? `全案监督收口完成（${n} 个部门已交付）。` : '全案监督收口完成。',
      traceId: params.traceId,
      metadata: {
        distributionId: params.distributionId ?? null,
        parentGoalTaskId: params.parentGoalTaskId ?? null,
      },
    });
  }

  async emitFailure(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    traceId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const program = await this.programClient.getActive({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId,
    });
    if (!program) return;

    let current = program;
    if (canTransitionProgramPhase(program.phase, 'failed')) {
      current = await this.safeTransition({
        companyId: params.companyId,
        programId: program.id,
        fromPhase: program.phase,
        toPhase: 'failed',
        traceId: params.traceId,
      });
    }

    await this.programTimeline.append({
      companyId: params.companyId,
      programId: current.id,
      phase: current.phase,
      kind: 'failed',
      summary: params.summary.slice(0, 200),
      traceId: params.traceId,
      metadata: params.metadata,
    });
  }

  private async safeTransition(params: {
    companyId: string;
    programId: string;
    fromPhase: CollaborationProgramPhase;
    toPhase: CollaborationProgramPhase;
    traceId?: string | null;
    patch?: Parameters<CollaborationProgramClientService['transition']>[0]['patch'];
  }): Promise<CollaborationProgramRecord> {
    try {
      const program = await this.programClient.transition({
        companyId: params.companyId,
        programId: params.programId,
        toPhase: params.toPhase,
        patch: params.patch,
      });
      this.logger.log('foundry.collaboration.program.phase_transition', {
        companyId: params.companyId,
        programId: params.programId,
        from: params.fromPhase,
        to: params.toPhase,
        traceId: params.traceId ?? null,
      });
      return program;
    } catch (e: unknown) {
      this.logger.warn('collaboration_program.transition_failed', {
        companyId: params.companyId,
        programId: params.programId,
        from: params.fromPhase,
        to: params.toPhase,
        err: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}
