import { Injectable } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { randomUUID } from 'crypto';
import type {
  CollaborationAgentMessageEnvelope,
  EmployeeTaskProposedEvent,
  TaskDelegationRequestedEvent,
} from '@contracts/events';
import {
  COLLABORATION_AGENT_MESSAGE_DOMAIN_V2_ROUTING_KEY,
  COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
  CollaborationAgentMessageEnvelopeSchema,
  EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
} from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';

/**
 * W7/W12：协作领域事件出站（TaskDelegation / Employee propose / Agent envelope 镜像）。
 * 由 flag {@link ConfigService.isAutonomousEventBusV2Enabled} + 公司级解析门控；入站聊天消息见 API
 * `collaboration.chat.message.ingested.v2`（与 legacy `collaboration.message.received` 互斥发布）。
 */
@Injectable()
export class CollaborationDomainEventPublisher {
  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
    private readonly l1Flags: L1FeatureFlagService,
  ) {}

  async isEventBusV2Active(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    if (!this.config.isAutonomousEventBusV2Enabled()) return false;
    return this.l1Flags.isAutonomousEventBusV2Effective(companyId, clientFeatureFlags);
  }

  async publishTaskDelegationRequested(event: TaskDelegationRequestedEvent): Promise<void> {
    await this.messaging.publish(event, {
      routingKey: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
      persistent: true,
    });
  }

  /**
   * 由结构化载荷组装完整事件并发布（Director / ACP 共用）。
   */
  async publishTaskDelegationFromData(data: TaskDelegationRequestedEvent['data']): Promise<void> {
    const event: TaskDelegationRequestedEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
      aggregateId: data.delegation.taskId,
      aggregateType: 'task',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: data.companyId,
      data,
    };
    await this.publishTaskDelegationRequested(event);
  }

  async publishEmployeeTaskProposed(event: EmployeeTaskProposedEvent): Promise<void> {
    await this.messaging.publish(event, {
      routingKey: EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
      persistent: true,
    });
  }

  async publishEmployeeTaskProposedFromData(data: EmployeeTaskProposedEvent['data']): Promise<void> {
    const event: EmployeeTaskProposedEvent = {
      eventId: randomUUID(),
      eventType: EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
      aggregateId: `${data.traceId}:${data.fromAgentId}`,
      aggregateType: 'task',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: data.companyId,
      data,
    };
    await this.publishEmployeeTaskProposed(event);
  }

  /**
   * 将已通过 Zod 校验的 ACP envelope 镜像到 `collaboration.agent-message.domain.v2`（双写观测；不改变 legacy ack 路由键）。
   */
  async mirrorAgentEnvelopeDomainV2(params: {
    companyId: string;
    envelope: CollaborationAgentMessageEnvelope;
    mirrorOf: 'received' | 'acked';
  }): Promise<void> {
    if (!(await this.isEventBusV2Active(params.companyId))) return;
    const wrapped = {
      eventId: randomUUID(),
      eventType: COLLABORATION_AGENT_MESSAGE_DOMAIN_V2_ROUTING_KEY,
      aggregateId: params.envelope.messageId,
      aggregateType: 'agent_message' as const,
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        ...params.envelope,
        mirrorOf: params.mirrorOf,
      },
    };
    await this.messaging.publish(wrapped, {
      routingKey: COLLABORATION_AGENT_MESSAGE_DOMAIN_V2_ROUTING_KEY,
      persistent: true,
    });
  }

  /** 尝试把任意 ACP 载荷规范化为 envelope 并镜像（失败则静默跳过）。 */
  async tryMirrorRawAgentPayload(params: {
    companyId: string;
    raw: unknown;
    mirrorOf: 'received' | 'acked';
  }): Promise<void> {
    const parsed = CollaborationAgentMessageEnvelopeSchema.safeParse(params.raw);
    if (!parsed.success) return;
    await this.mirrorAgentEnvelopeDomainV2({
      companyId: params.companyId,
      envelope: parsed.data,
      mirrorOf: params.mirrorOf,
    });
  }
}
