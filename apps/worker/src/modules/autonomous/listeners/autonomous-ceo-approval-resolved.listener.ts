import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { AutonomousCeoApprovalResolvedEvent, TaskHeartbeatTickEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { CeoApprovalGateService } from '../services/ceo-approval-gate.service.js';

@Injectable()
export class AutonomousCeoApprovalResolvedListener implements OnModuleInit {
  private readonly logger = new Logger(AutonomousCeoApprovalResolvedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly gate: CeoApprovalGateService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AutonomousCeoApprovalResolvedEvent>(
      'autonomous.ceo.approval.resolved',
      this.handle.bind(this),
      {
        // 多实例 HITL resume：必须让所有 Worker 实例都接收到 resolved 事件，
        // 由于 RabbitMQ queue 是“竞争消费”模型，不能复用同名 queue。
        // 使用 exclusive + autoDelete，为每个实例创建独占队列，实现广播式消费。
        exclusive: true,
        autoDelete: true,
        durable: false,
        prefetchCount: 10,
      },
    );
  }

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private async handle(event: AutonomousCeoApprovalResolvedEvent): Promise<void> {
    try {
      const { companyId, approvalId, decision, metadata } = event.data;
      const note = metadata && typeof (metadata as any).note === 'string' ? (metadata as any).note : undefined;
      const normalizedDecision = decision === 'rejected' ? 'rejected' : 'approved';

      // 从 DB 查找所有匹配 approvalId 的任务（metadata.ceoApprovalId = approvalId）
      // 并写入最终 decision（metadata.ceoApprovalDecision）+ 状态迁移（review/pending -> in_progress；rejected -> blocked）
      const actor = this.actor();
      const tickAt = new Date().toISOString();

      const matchedTraceIds = new Set<string>();
      let matchedCount = 0;

      const statuses: Array<'pending' | 'review' | 'in_progress'> = ['pending', 'review', 'in_progress'];
      for (const st of statuses) {
        // 任务列表分页：因为 tasks.findAll 返回 totalPages
        let page = 1;
        const pageSize = 50;
        while (true) {
          const pageRes = await this.rpc<{
            items: Array<{
              id: string;
              status: string;
              requiresHumanApproval: boolean;
              metadata?: Record<string, unknown> | null;
            }>;
            totalPages: number;
          }>('tasks.findAll', {
            companyId,
            actor,
            status: st,
            assigneeType: 'agent',
            pageSize,
            page,
          });

          const items = pageRes?.items ?? [];
          for (const task of items) {
            const meta = (task.metadata ?? {}) as Record<string, unknown>;
            if (meta.ceoApprovalId !== approvalId) continue;

            matchedCount += 1;
            const ceoTraceId = meta.ceoTraceId;
            if (typeof ceoTraceId === 'string') {
              matchedTraceIds.add(ceoTraceId);
            }

            await this.rpc('tasks.update', {
              companyId,
              actor,
              id: task.id,
              data: {
                status: normalizedDecision === 'approved' ? 'in_progress' : 'blocked',
                progress: normalizedDecision === 'approved' ? 5 : undefined,
                blockedReason:
                  normalizedDecision === 'rejected' ? (note ?? 'CEO rejected') : undefined,
                metadata: {
                  ceoApprovalDecision: normalizedDecision,
                  ceoApprovalResolvedAt: tickAt,
                  ...(note ? { ceoApprovalNote: note } : {}),
                },
              },
            });
          }

          if (!pageRes || page >= pageRes.totalPages) break;
          page += 1;
        }
      }

      // 同步到进程内存 gate（可选，但能提升本实例行为一致性）
      for (const traceId of matchedTraceIds) {
        this.gate.resolveTrace({
          companyId,
          traceId,
          decision,
        });
      }

      // 只有匹配到任务才触发 tick，避免无效唤醒
      if (matchedCount > 0) {
        const tick: TaskHeartbeatTickEvent = {
          eventId: randomUUID(),
          eventType: 'task.heartbeat.tick',
          aggregateId: companyId,
          aggregateType: 'company',
          occurredAt: tickAt,
          version: 1,
          companyId,
          data: { companyId, tickAt },
        };

        await this.messaging.publish(tick, {
          routingKey: 'task.heartbeat.tick',
          persistent: true,
        });
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('autonomous.ceo.approval.resolved handled failed', { error: msg });
    }
  }
}

