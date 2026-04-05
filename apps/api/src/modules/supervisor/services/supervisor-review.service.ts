import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import {
  computeFailureSignatureHash,
  DEFAULT_CONFIDENCE_INGEST_THRESHOLD,
  parseSupervisorLlmJson,
  SUPERVISOR_LESSON_NAMESPACE,
  lessonMetadataKind,
  pickMemoryWriteTargets,
  resolveSupervisorLessonNamespaces,
  type Lesson,
} from '@foundry/supervisor-core';
import { redactUrlCredentials } from '@foundry/observability-core';
import type { SupervisorLessonIngestedEvent, SupervisorReviewCompletedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { ModelRouterService } from '../../billing/services/model-router.service.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { TaskExecutionLog } from '../../tasks/entities/task-execution-log.entity.js';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoom } from '../../collaboration/entities/chat-room.entity.js';
import { SupervisorLesson } from '../entities/supervisor-lesson.entity.js';

export interface SupervisorRunContextDto {
  companyId: string;
  runId: string;
  taskId?: string | null;
  errorSummary: string;
  taskTitle?: string | null;
  logExcerpt: string;
  assigneeType?: string | null;
  assigneeId?: string | null;
  agentOrganizationNodeId?: string | null;
}

function partitionLabelForNamespace(ns: string): 'company' | 'agent' | 'department' | 'other' {
  if (ns === SUPERVISOR_LESSON_NAMESPACE) return 'company';
  if (ns.startsWith('lesson:agent:')) return 'agent';
  if (ns.startsWith('lesson:dept:')) return 'department';
  return 'other';
}

@Injectable()
export class SupervisorReviewService {
  private readonly logger = new Logger(SupervisorReviewService.name);

  constructor(
    @InjectRepository(SupervisorLesson)
    private readonly lessonsRepo: Repository<SupervisorLesson>,
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(ChatRoom) private readonly roomsRepo: Repository<ChatRoom>,
    private readonly memory: MemoryService,
    private readonly modelRouter: ModelRouterService,
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
    private readonly chatMessages: ChatMessageService,
  ) {}

  async buildRunContext(companyId: string, runId: string, taskId?: string | null): Promise<SupervisorRunContextDto> {
    const run = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!run) {
      throw new NotFoundException('run not found');
    }
    const logs = await this.logsRepo.find({
      where: { companyId, runId },
      order: { createdAt: 'DESC' },
      take: 40,
    });
    const lines = logs
      .map((l) => {
        const msg = redactUrlCredentials((l.message ?? '').slice(0, 1500));
        return `[${l.stepType}] ${msg}`;
      })
      .reverse();
    const tid = taskId ?? logs.find((x) => x.taskId)?.taskId ?? null;
    let taskTitle: string | null = null;
    let assigneeType: string | null = null;
    let assigneeId: string | null = null;
    let agentOrganizationNodeId: string | null = null;
    if (tid) {
      const task = await this.tasksRepo.findOne({
        where: { id: tid, companyId },
        select: ['title', 'assigneeType', 'assigneeId'],
      });
      taskTitle = task?.title ?? null;
      assigneeType = task?.assigneeType ?? null;
      assigneeId = task?.assigneeId ?? null;
      if (assigneeType === 'agent' && assigneeId) {
        const agent = await this.agentsRepo.findOne({
          where: { id: assigneeId, companyId },
          select: ['organizationNodeId'],
        });
        agentOrganizationNodeId = agent?.organizationNodeId ?? null;
      }
    }
    return {
      companyId,
      runId,
      taskId: tid,
      errorSummary: redactUrlCredentials((run.errorSummary ?? '').slice(0, 8000)),
      taskTitle,
      logExcerpt: lines.join('\n').slice(0, 12000),
      assigneeType,
      assigneeId,
      agentOrganizationNodeId,
    };
  }

  async analyzeLessonsWithLlm(companyId: string, ctx: SupervisorRunContextDto): Promise<Lesson[]> {
    const key = this.config.getMemoryConfig().openaiApiKey;
    const routed = await this.modelRouter.resolveModel({
      companyId,
      agentRole: 'director',
      taskPriority: 'high',
    });
    const model = routed.modelName;

    const system = `You are a production supervisor. Given a failed task run, output STRICT JSON:
{"lessons":[{"rootCause":"string","lesson":"string","preventiveAction":"string","confidence":0.0-1.0,"impactOnBudgetOrRoi":0}]}
confidence reflects how sure you are. Use the same language as the error/logs (often Chinese).
At least one lesson. impactOnBudgetOrRoi optional (negative if waste).`;

    const user = `runId=${ctx.runId}
taskTitle=${ctx.taskTitle ?? ''}
errorSummary=${ctx.errorSummary}
executionLogExcerpt:
${ctx.logExcerpt}`;

    if (!key) {
      this.logger.warn('OPENAI_API_KEY missing; supervisor using heuristic lesson');
      return [
        {
          rootCause: 'LLM unavailable',
          lesson: ctx.errorSummary.slice(0, 1500),
          preventiveAction: 'Inspect logs and retry with corrected inputs.',
          confidence: 0.45,
          impactOnBudgetOrRoi: 0,
        },
      ];
    }

    const base = this.config.getMemoryConfig().openaiBaseUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      this.logger.warn('supervisor LLM failed', { status: res.status, t: t.slice(0, 400) });
      throw new Error(`SUPERVISOR_LLM_HTTP_${res.status}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json?.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error('SUPERVISOR_LLM_EMPTY');
    }
    const parsed = parseSupervisorLlmJson(raw);
    return parsed.lessons;
  }

  /**
   * Full pipeline: LLM → Postgres rows → memory (gated, dual-write company + 分区) → events.
   */
  async executeReviewPipeline(params: {
    companyId: string;
    runId: string;
    taskId?: string | null;
    temporalWorkflowId?: string | null;
  }): Promise<{
    lessonsParsed: number;
    lessonsIngestedToMemory: number;
    lowConfidenceCount: number;
    memoryNamespacesUsed: string[];
  }> {
    const { companyId, runId } = params;
    const ctx = await this.buildRunContext(companyId, runId, params.taskId);
    const lessons = await this.analyzeLessonsWithLlm(companyId, ctx);
    const sigHash = computeFailureSignatureHash({
      errorSummary: ctx.errorSummary,
      taskTitle: ctx.taskTitle,
    });

    const partitionList = resolveSupervisorLessonNamespaces({
      assigneeType: ctx.assigneeType,
      assigneeId: ctx.assigneeId,
      agentOrganizationNodeId: ctx.agentOrganizationNodeId,
    });
    const writeTargets = pickMemoryWriteTargets(partitionList);

    const existingBefore = await this.lessonsRepo.count({
      where: { companyId, failureSignatureHash: sigHash },
    });
    const isRepeatPattern = existingBefore > 0;

    let ingested = 0;
    let lowConf = 0;
    for (const L of lessons) {
      if (L.confidence < DEFAULT_CONFIDENCE_INGEST_THRESHOLD) {
        lowConf += 1;
      }
      const row = this.lessonsRepo.create({
        companyId,
        runId,
        taskId: ctx.taskId ?? null,
        failureSignatureHash: sigHash,
        rootCause: L.rootCause,
        lesson: L.lesson,
        preventiveAction: L.preventiveAction,
        confidence: L.confidence,
        impactOnBudgetOrRoi: L.impactOnBudgetOrRoi ?? null,
        ingestedToMemory: false,
        isRepeatPattern,
        memoryEntryId: null,
      });
      const saved = await this.lessonsRepo.save(row);

      if (L.confidence >= DEFAULT_CONFIDENCE_INGEST_THRESHOLD) {
        const content = [
          `【教训】${L.lesson}`,
          `根因: ${L.rootCause}`,
          `预防: ${L.preventiveAction}`,
          `runId=${runId} taskId=${ctx.taskId ?? 'n/a'}`,
        ].join('\n');

        let canonicalMemId: string | null = null;
        for (const namespace of writeTargets) {
          const mem = await this.memory.storeEntry({
            companyId,
            namespace,
            collectionLabel: 'Supervisor lessons',
            content,
            sourceType: 'task',
            sourceRef: runId,
            skipAccessCheck: true,
            metadata: {
              kind: lessonMetadataKind(),
              failureSignatureHash: sigHash,
              runId,
              taskId: ctx.taskId ?? null,
              confidence: L.confidence,
              partition: partitionLabelForNamespace(namespace),
              memoryWriteTargets: writeTargets,
            },
          });
          if (namespace === SUPERVISOR_LESSON_NAMESPACE) {
            canonicalMemId = mem.id;
          }
        }
        if (!canonicalMemId && writeTargets.length > 0) {
          this.logger.warn('supervisor memory: missing company namespace write', { runId, writeTargets });
        }

        saved.ingestedToMemory = true;
        saved.memoryEntryId = canonicalMemId;
        await this.lessonsRepo.save(saved);
        ingested += 1;
        const ev: SupervisorLessonIngestedEvent = {
          eventId: randomUUID(),
          eventType: 'supervisor.lesson.ingested',
          aggregateId: saved.id,
          aggregateType: 'supervisor_lesson',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId,
          data: {
            companyId,
            runId,
            lessonId: saved.id,
            failureSignatureHash: sigHash,
            namespace: writeTargets.join(','),
            ingestedAt: new Date().toISOString(),
          },
        };
        await this.messaging.publish(ev, {
          routingKey: 'supervisor.lesson.ingested',
          persistent: true,
        });
      }
    }

    if (lowConf > 0) {
      await this.maybeNotifyLowConfidence(companyId, runId, lowConf);
    }

    const done: SupervisorReviewCompletedEvent = {
      eventId: randomUUID(),
      eventType: 'supervisor.review.completed',
      aggregateId: runId,
      aggregateType: 'supervisor_review',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        runId,
        taskId: ctx.taskId ?? undefined,
        workflowId: params.temporalWorkflowId ?? undefined,
        lessonsParsed: lessons.length,
        lessonsIngestedToMemory: ingested,
        lowConfidenceCount: lowConf,
        completedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(done, {
      routingKey: 'supervisor.review.completed',
      persistent: true,
    });

    return {
      lessonsParsed: lessons.length,
      lessonsIngestedToMemory: ingested,
      lowConfidenceCount: lowConf,
      memoryNamespacesUsed: writeTargets,
    };
  }

  private async maybeNotifyLowConfidence(
    companyId: string,
    runId: string,
    lowConfidenceCount: number,
  ): Promise<void> {
    try {
      const room = await this.roomsRepo.findOne({
        where: { companyId, roomType: 'main' },
        order: { createdAt: 'ASC' },
      });
      if (!room?.id) return;
      const actor = room.createdBy;
      if (!actor) return;
      await this.chatMessages.appendSystemMessageAsActor(
        companyId,
        room.id,
        actor,
        `[Supervisor] 复盘 run ${runId} 有 ${lowConfidenceCount} 条教训置信度偏低，请人工核对后再强化策略。`,
        { kind: 'supervisor_low_confidence', runId, lowConfidenceCount },
      );
    } catch (e: unknown) {
      this.logger.warn('low-confidence collaboration notify failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
