import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MessagingService } from '@service/messaging';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import {
  COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
  type CollaborationMainRoomRoundtableStepEvent,
} from '@contracts/events';
import { ConfigService } from '../../common/config/config.service.js';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import type { RoomContext } from './contracts/collaboration-2026.contracts.js';
import { metrics } from '@opentelemetry/api';

const roundtableMeter = metrics.getMeter('foundry.collaboration');
const roundtableSessionScheduledCounter = roundtableMeter.createCounter(
  'foundry.collaboration.main_room_roundtable.session_scheduled_total',
  { description: 'Main room roundtable first MQ message published' },
);
const roundtableStepCompletedCounter = roundtableMeter.createCounter(
  'foundry.collaboration.main_room_roundtable.step_completed_total',
  { description: 'Roundtable agent reply appended to main room' },
);

function clip(s: string, max: number): string {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * 主群 Ask（discussion）下：人类 @ 多 agent 后，由 MQ 步进驱动各 agent 在主房 append 一条短讨论（有界轮次，不回流 Intent）。
 * 首轮与后续步进共用 {@link COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY}（`roundIndex` 由 0 递增）。
 */
@Injectable()
export class MainRoomRoundtableService {
  private readonly logger = new Logger(MainRoomRoundtableService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
    private readonly redisCache: RedisCacheService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }

  /**
   * 管线成功落 CEO 回复后调用：满足条件则发布首轮 roundtable step（幂等按 anchorMessageId）。
   */
  async tryScheduleAfterMainRoomPipeline(params: {
    companyId: string;
    roomId: string;
    anchorMessageId: string;
    roomContext: RoomContext;
    humanSenderId: string;
    humanMessageContent: string;
    mentionedAgentIds: string[];
    ceoAgentId: string | null;
    threadId?: string | null;
  }): Promise<void> {
    if (!this.config.isCollabMainRoomRoundtableEnabled()) return;
    if (params.roomContext.roomType !== 'main') return;
    if (String(params.roomContext.collaborationMode ?? '').trim() !== 'discussion') return;

    const ceo = String(params.ceoAgentId ?? '').trim().toLowerCase();
    const maxTargets = this.config.getCollabMainRoomMaxDirectTargets();
    const participants = Array.from(
      new Set(
        (params.mentionedAgentIds ?? [])
          .map((id) => String(id ?? '').trim())
          .filter(Boolean)
          .filter((id) => !ceo || id.toLowerCase() !== ceo),
      ),
    ).slice(0, maxTargets);

    if (participants.length < 2) return;

    const ttlMs = this.config.getCollabMainRoomRoundtableRedisTtlMs();
    const pfx = this.config.getRedisKeyPrefix();
    const sessionKey = `${pfx}roundtable:session:${params.companyId}:${params.anchorMessageId}`;
    const gotSession = await this.redisCache.setNxPx(sessionKey, '1', ttlMs);
    if (!gotSession) {
      this.logger.debug('main_room_roundtable.session_dedup_skip', {
        roomId: params.roomId,
        anchorMessageId: params.anchorMessageId,
      });
      return;
    }

    const maxRounds = Math.min(this.config.getCollabMainRoomRoundtableMaxRounds(), participants.length);
    const sessionId = randomUUID();
    const evt: CollaborationMainRoomRoundtableStepEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
      aggregateId: params.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        roomId: params.roomId,
        sessionId,
        anchorMessageId: params.anchorMessageId,
        humanSenderId: String(params.humanSenderId ?? '').trim(),
        humanMessageContent: clip(params.humanMessageContent, 8000),
        participantAgentIds: participants,
        roundIndex: 0,
        maxRounds,
        priorReplies: [],
        threadId: params.threadId ?? null,
        requestedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(evt, {
      routingKey: COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
      persistent: true,
    });
    roundtableSessionScheduledCounter.add(1, { companyId: params.companyId });
    this.logger.log('main_room_roundtable.requested', {
      companyId: params.companyId,
      roomId: params.roomId,
      sessionId,
      anchorMessageId: params.anchorMessageId,
      participants: participants.length,
      maxRounds,
    });
  }

  async handleStep(event: CollaborationMainRoomRoundtableStepEvent): Promise<void> {
    const d = event.data;
    const ttlMs = this.config.getCollabMainRoomRoundtableRedisTtlMs();
    const pfx = this.config.getRedisKeyPrefix();
    const stepKey = `${pfx}roundtable:step:${d.companyId}:${d.sessionId}:${d.roundIndex}`;
    const got = await this.redisCache.setNxPx(stepKey, '1', ttlMs);
    if (!got) {
      this.logger.debug('main_room_roundtable.step_dedup_skip', {
        sessionId: d.sessionId,
        roundIndex: d.roundIndex,
      });
      return;
    }

    const agentId = d.participantAgentIds[d.roundIndex];
    if (!agentId) {
      this.logger.warn('main_room_roundtable.missing_agent', { sessionId: d.sessionId, roundIndex: d.roundIndex });
      return;
    }

    const priorBlock =
      d.priorReplies.length === 0
        ? '（尚无前序同事发言）'
        : d.priorReplies
            .map((r) => `- agent ${r.agentId}: ${r.preview}`)
            .join('\n');

    const nParticipants = d.participantAgentIds.length;
    const turnLabel = `第 ${d.roundIndex + 1} / ${nParticipants} 位`;

    const system = [
      `你是主协作群内的一名 Agent（本轮发言顺序：**${turnLabel}**，仅代表你自己这一角色的视角）。`,
      '场景：**讨论模式（Ask）**下的「圆桌接力」——为人类锚点消息补充专业看法；**不是**公司 Strategy/Orchestration 执行链，**不得**承诺已发起工单或跨部门正式下发。',
      '输出：纯正文中文；建议约 120～380 字；专业、具体；可先一句对齐用户关切再给观点。',
      '约束：不要使用 `@` 提及他人（避免触发新一轮路由）；不要重复前序同事已说过的同一段话；不要输出 JSON、Markdown 标题围栏或内部术语。',
    ].join('\n');

    const human = [
      `【发言席位】${turnLabel}（本轮共 ${nParticipants} 位同事依次发言；仅代表本角色，勿代替他人立场）。`,
      `【用户原话】\n${d.humanMessageContent}`,
      `【前序同事摘要】\n${priorBlock}`,
      '请基于你的角色给出一段讨论回复（纯正文，一段即可）。',
    ].join('\n\n');

    let reply = '（本轮讨论生成暂不可用，请稍后重试。）';
    try {
      const model = await this.llmBridge.createChatModel({
        companyId: d.companyId,
        agentId,
        fallbackModelName: this.config.getCeoReplayModelName(),
        llmTimeoutMs: Math.max(8_000, Math.min(45_000, this.config.getCollaborationMentionRpcTimeoutMs())),
        maxOutputTokens: 512,
        temperatureOverride: 0.35,
        disableReasoning: true,
        ceoContext: 'replay',
        trace: { messageId: d.anchorMessageId, callsite: 'collab.main_room_roundtable' },
        meteringAgentId: agentId,
      });
      const raw = await model.invoke([new SystemMessage(system), new HumanMessage(human)]);
      const text =
        typeof (raw as { content?: unknown })?.content === 'string'
          ? String((raw as { content: string }).content)
          : String((raw as { content?: unknown })?.content ?? '');
      reply = clip(text, 2000) || reply;
    } catch (e: unknown) {
      this.logger.warn('main_room_roundtable.llm_failed', {
        sessionId: d.sessionId,
        roundIndex: d.roundIndex,
        agentId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    await this.rpc('collaboration.messages.appendAgent', {
      companyId: d.companyId,
      actor: this.workerActor(),
      roomId: d.roomId,
      agentId,
      content: reply,
      messageType: 'text',
      threadId: d.threadId ?? undefined,
      metadata: {
        source: 'main_room_roundtable',
        roundtableSessionId: d.sessionId,
        roundIndex: d.roundIndex,
        anchorMessageId: d.anchorMessageId,
        directReplyToMessageId: d.anchorMessageId,
        provisional: false,
      },
    });

    roundtableStepCompletedCounter.add(1, { companyId: d.companyId });

    const next = d.roundIndex + 1;
    if (next >= d.maxRounds || next >= d.participantAgentIds.length) {
      this.logger.log('main_room_roundtable.completed', {
        sessionId: d.sessionId,
        lastRound: d.roundIndex,
      });
      return;
    }

    const nextEvt: CollaborationMainRoomRoundtableStepEvent = {
      eventId: randomUUID(),
      eventType: COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
      aggregateId: d.roomId,
      aggregateType: 'chat_room',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: d.companyId,
      data: {
        ...d,
        roundIndex: next,
        priorReplies: [
          ...d.priorReplies,
          { agentId, preview: clip(reply, 500) },
        ],
        requestedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(nextEvt, {
      routingKey: COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
      persistent: true,
    });
  }
}
