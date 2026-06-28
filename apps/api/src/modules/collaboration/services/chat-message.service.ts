import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { MentionResolverService, type MentionAliasConfig } from '@foundry/collaboration-core';
import type {
  CollaborationMemoryIndexRequestedEvent,
  CollaborationMentionRoutedEvent,
  CollaborationMessageReceivedEvent,
  CollaborationTaskExtractedEvent,
} from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { TenantContextService } from '@service/tenant';
import {
  ChatMessage,
  type ChatMemoryReference,
  type ChatMessageType,
  type ChatSenderType,
} from '../entities/chat-message.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { SendChatMessageDto } from '../dto/send-message.dto.js';
import { ListChatMessagesDto } from '../dto/list-messages.dto.js';
import { SearchChatMessagesDto } from '../dto/search-messages.dto.js';
import {
  extractMentionedAgentIds,
  hasCeoAliasMention,
} from '../utils/collaboration-mention.util.js';
import { ChatRoomService } from './chat-room.service.js';
import { DiscussionThreadService } from './discussion-thread.service.js';
import { RoomMemberService } from './room-member.service.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { MentionAliasesService } from './mention-aliases.service.js';
import { MessageProcessingOrchestratorService } from './message-processing-orchestrator.service.js';
import { CollaborationRoleRoutingService } from './collaboration-role-routing.service.js';
import { AudienceRouterService } from '../audience/audience-router.service.js';
import type { CollaborationAppendAgentMetadataDto } from '../dto/append-agent-metadata.dto.js';
import { ConfigService } from '../../../common/config/config.service.js';
import type { IntentMessageCategory } from '@contracts/types';

const CLIENT_MESSAGE_CATEGORIES = new Set<IntentMessageCategory>([
  'chat',
  'report',
  'approval',
  'coordination',
]);

interface ActorRef {
  id: string;
}

type MentionResolution = {
  mentionedAgentIds: string[];
  mentionedNodeIds: string[];
  resolvedFrom?: string;
  confidence?: number;
  labels?: string[];
};

/**
 * TypeORM 0.3+ returns `[rows, rowCount]` for PostgreSQL UPDATE/DELETE raw queries,
 * not a flat row array. See `PostgresQueryRunner.query` (result.raw for UPDATE).
 */
function clipRichCardPayload(card: Record<string, unknown>): Record<string, unknown> {
  const out = { ...card };
  if (typeof out.cardType === 'string') out.cardType = out.cardType.slice(0, 64);
  if (typeof out.title === 'string') out.title = out.title.slice(0, 500);
  if (typeof out.taskId === 'string') out.taskId = out.taskId.slice(0, 64);
  if (typeof out.status === 'string') out.status = out.status.slice(0, 32);
  if (typeof out.skillName === 'string') out.skillName = out.skillName.slice(0, 120);
  if (typeof out.skillExecutionId === 'string') out.skillExecutionId = out.skillExecutionId.slice(0, 128);
  if (Array.isArray(out.acceptanceCriteria)) {
    out.acceptanceCriteria = out.acceptanceCriteria
      .slice(0, 30)
      .map((x) => String(x ?? '').slice(0, 500));
  }
  if (Array.isArray(out.artifacts)) {
    out.artifacts = out.artifacts.slice(0, 12).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      return {
        type: typeof row.type === 'string' ? row.type.slice(0, 64) : row.type,
        ...(typeof row.uri === 'string' ? { uri: row.uri.slice(0, 2048) } : {}),
        ...(typeof row.content === 'string' ? { content: row.content.slice(0, 6000) } : {}),
        ...(typeof row.label === 'string' ? { label: row.label.slice(0, 120) } : {}),
        ...(typeof row.fileAssetId === 'string' ? { fileAssetId: row.fileAssetId.slice(0, 64) } : {}),
      };
    });
  }
  if (Array.isArray(out.downloadableFiles)) {
    out.downloadableFiles = out.downloadableFiles.slice(0, 24).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      return {
        ...(typeof row.fileAssetId === 'string' ? { fileAssetId: row.fileAssetId.slice(0, 64) } : {}),
        ...(typeof row.name === 'string' ? { name: row.name.slice(0, 512) } : {}),
        ...(typeof row.sourceTaskId === 'string' ? { sourceTaskId: row.sourceTaskId.slice(0, 64) } : {}),
        ...(typeof row.departmentSlug === 'string' ? { departmentSlug: row.departmentSlug.slice(0, 64) } : {}),
      };
    });
  }
  if (Array.isArray(out.departments)) {
    out.departments = out.departments.slice(0, 24).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      const files = Array.isArray(row.files)
        ? row.files.slice(0, 12).map((f) => {
            if (!f || typeof f !== 'object') return f;
            const fr = f as Record<string, unknown>;
            return {
              ...(typeof fr.fileAssetId === 'string' ? { fileAssetId: fr.fileAssetId.slice(0, 64) } : {}),
              ...(typeof fr.name === 'string' ? { name: fr.name.slice(0, 512) } : {}),
              ...(typeof fr.sourceTaskId === 'string' ? { sourceTaskId: fr.sourceTaskId.slice(0, 64) } : {}),
              ...(typeof fr.departmentSlug === 'string' ? { departmentSlug: fr.departmentSlug.slice(0, 64) } : {}),
            };
          })
        : undefined;
      return {
        slug: typeof row.slug === 'string' ? row.slug.slice(0, 64) : row.slug,
        ...(typeof row.label === 'string' ? { label: row.label.slice(0, 120) } : {}),
        status: typeof row.status === 'string' ? row.status.slice(0, 64) : row.status,
        ...(typeof row.artifactPreview === 'string'
          ? { artifactPreview: row.artifactPreview.slice(0, 240) }
          : {}),
        ...(files ? { files } : {}),
      };
    });
  }
  if (typeof out.strategyGoal === 'string') out.strategyGoal = out.strategyGoal.slice(0, 8000);
  return out;
}

/**
 * appendAgent 持久化前的 metadata 加固（长度 / 数组上限），与 RPC DTO {@link CollaborationAppendAgentMetadataDto} 对齐。
 */
export function sanitizeAppendAgentMetadataForPersist(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...meta };
  const clip = (key: string, max: number) => {
    const v = out[key];
    if (typeof v === 'string') out[key] = v.slice(0, max);
  };
  clip('planningSummary', 8000);
  clip('finalSummary', 8000);
  clip('traceId', 128);
  clip('workflowId', 128);
  clip('routePath', 64);
  clip('intentType', 64);
  clip('source', 120);
  clip('directReplyToMessageId', 64);
  clip('approvalRequestId', 64);
  clip('approvalStatus', 64);
  clip('routingMode', 64);
  clip('roomType', 32);
  clip('streamId', 128);
  clip('kind', 64);
  clip('departmentSlug', 64);
  clip('directorAgentId', 64);
  clip('subGoalTaskId', 64);
  clip('goalDelegationKey', 256);
  clip('parentGoalTaskId', 64);
  clip('planTaskId', 128);
  clip('distributionId', 128);

  if (Array.isArray(out.heavyExecutionTrace)) {
    out.heavyExecutionTrace = out.heavyExecutionTrace.slice(0, 200).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const r = row as Record<string, unknown>;
      return {
        ...(typeof r.at === 'string' ? { at: r.at.slice(0, 64) } : {}),
        ...(typeof r.stage === 'string' ? { stage: r.stage.slice(0, 64) } : {}),
        ...(typeof r.note === 'string' ? { note: r.note.slice(0, 2000) } : {}),
        ...(r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta) ? { meta: r.meta } : {}),
      };
    });
  }

  if (typeof out.distributionCount === 'number') {
    out.distributionCount = Math.min(10_000, Math.max(0, Math.floor(out.distributionCount)));
  }
  if (typeof out.confidence === 'number') {
    out.confidence = Math.min(1, Math.max(0, out.confidence));
  }
  if (typeof out.completedChildCount === 'number') {
    out.completedChildCount = Math.min(500, Math.max(0, Math.floor(out.completedChildCount)));
  }

  if (out.distributionDraft && typeof out.distributionDraft === 'object' && !Array.isArray(out.distributionDraft)) {
    const d = out.distributionDraft as Record<string, unknown>;
    const rowsRaw = Array.isArray(d.rows) ? d.rows : [];
    out.distributionDraft = {
      schemaVersion: String(d.schemaVersion ?? '').slice(0, 8),
      distributionId: String(d.distributionId ?? '').slice(0, 128),
      planId: String(d.planId ?? '').slice(0, 128),
      pendingDepartmentDispatchConfirm: Boolean(d.pendingDepartmentDispatchConfirm),
      rows: rowsRaw.slice(0, 24).map((row) => {
        if (!row || typeof row !== 'object') {
          return { department: '—', priority: 'P1', deliverable: '—' };
        }
        const r = row as Record<string, unknown>;
        return {
          department: String(r.department ?? '').trim().slice(0, 64) || '—',
          priority: String(r.priority ?? '').trim().slice(0, 8) || 'P1',
          deliverable: String(r.deliverable ?? '').trim().slice(0, 4000) || '—',
        };
      }),
    };
  }

  clip('fastReplySource', 120);

  if (out.richCard && typeof out.richCard === 'object' && !Array.isArray(out.richCard)) {
    out.richCard = clipRichCardPayload(out.richCard as Record<string, unknown>);
  }

  /** CEO v2 直连回复：保留结构但限制超大字符串，避免 JSONB 膨胀 */
  const ls = out.lightStructuredOutputV2;
  if (ls && typeof ls === 'object' && !Array.isArray(ls)) {
    const o = { ...(ls as Record<string, unknown>) };
    if (typeof o.finalText === 'string') o.finalText = o.finalText.slice(0, 16_000);
    if (typeof o.commitmentText === 'string') o.commitmentText = o.commitmentText.slice(0, 4000);
    if (Array.isArray(o.suggestedTasks)) o.suggestedTasks = o.suggestedTasks.slice(0, 64);
    if (Array.isArray(o.memoryReferences)) o.memoryReferences = o.memoryReferences.slice(0, 64);
    if (o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)) {
      const md = { ...(o.metadata as Record<string, unknown>) };
      const rc = md.richCard;
      if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
        const card = { ...(rc as Record<string, unknown>) };
        if (typeof card.strategyGoal === 'string') card.strategyGoal = card.strategyGoal.slice(0, 8000);
        if (Array.isArray(card.strategicPhases)) {
          card.strategicPhases = card.strategicPhases.slice(0, 16).map((ph) => {
            if (!ph || typeof ph !== 'object') return ph;
            const p = ph as Record<string, unknown>;
            return {
              phaseId: typeof p.phaseId === 'string' ? p.phaseId.slice(0, 40) : p.phaseId,
              title: typeof p.title === 'string' ? p.title.slice(0, 500) : p.title,
              outcome: typeof p.outcome === 'string' ? p.outcome.slice(0, 4000) : p.outcome,
              ...(typeof p.deadline === 'string' ? { deadline: p.deadline.slice(0, 64) } : {}),
            };
          });
        }
        if (Array.isArray(card.actions)) {
          card.actions = card.actions.slice(0, 12).map((a) => {
            if (!a || typeof a !== 'object') return a;
            const act = a as Record<string, unknown>;
            return {
              actionId: typeof act.actionId === 'string' ? act.actionId.slice(0, 64) : act.actionId,
              label: typeof act.label === 'string' ? act.label.slice(0, 120) : act.label,
              sendText: typeof act.sendText === 'string' ? act.sendText.slice(0, 2000) : act.sendText,
            };
          });
        }
        md.richCard = clipRichCardPayload(card);
      }
      o.metadata = md;
    }
    out.lightStructuredOutputV2 = o;
  }
  if (out.intentDecision2026_1 && typeof out.intentDecision2026_1 === 'object') {
    const id1 = out.intentDecision2026_1 as Record<string, unknown>;
    const raw = JSON.stringify(id1);
    if (raw.length > 120_000) {
      out.intentDecision2026_1 = { truncated: true, note: 'intentDecision2026_1 exceeded persist cap' };
    }
  }

  return out;
}

function firstRowFromTypeOrmRawQuery(result: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const head = result[0];
  if (Array.isArray(head) && result.length >= 2 && typeof result[1] === 'number') {
    return head[0] as Record<string, unknown> | undefined;
  }
  return head as Record<string, unknown> | undefined;
}

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);
  private readonly mentionResolver = new MentionResolverService();

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly rooms: ChatRoomService,
    private readonly threads: DiscussionThreadService,
    private readonly members: RoomMemberService,
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly mentionAliasesService: MentionAliasesService,
    private readonly roleRouting: CollaborationRoleRoutingService,
    private readonly audienceRouter: AudienceRouterService,
    private readonly config: ConfigService,
    private readonly messageProcessingOrchestrator: MessageProcessingOrchestratorService,
  ) {}

  private filterExistingAgentMentions(
    ids: Iterable<string>,
    pool: Array<{ id: string }>,
  ): { validAgentIds: string[]; droppedAgentIds: string[] } {
    const active = new Set(pool.map((a) => a.id));
    const validAgentIds: string[] = [];
    const droppedAgentIds: string[] = [];
    for (const id of ids) {
      if (!id || typeof id !== 'string') continue;
      if (active.has(id)) validAgentIds.push(id);
      else droppedAgentIds.push(id);
    }
    return {
      validAgentIds: Array.from(new Set(validAgentIds)),
      droppedAgentIds: Array.from(new Set(droppedAgentIds)),
    };
  }

  private async resolveMentions(
    companyId: string,
    roomId: string,
    content: string,
  ): Promise<MentionResolution> {
    const inlineIds = extractMentionedAgentIds(content);
    const nodeIds = new Set<string>();
    const ids = new Set<string>();
    if (hasCeoAliasMention(content)) {
      const ceo = await this.agentsRepo.findOne({
        where: { companyId, role: 'ceo', status: 'active' },
      });
      if (ceo?.id) {
        const activeInRoom = await this.members.isActiveMember(
          companyId,
          roomId,
          'agent',
          ceo.id,
        );
        if (!activeInRoom) {
          await this.members.addMembers(companyId, roomId, [
            { memberType: 'agent', memberId: ceo.id },
          ]);
        }
        ids.add(ceo.id);
      }
    }
    /** 候选池必须覆盖房内全部 active agent（否则 @中文名/职务 解析不到），再补足公司级上限用于非在房别名。 */
    const maxCandidates = 300;
    const activeMembers = await this.members.listActiveMembers(companyId, roomId);
    const roomAgentIds = activeMembers
      .filter((m) => m.memberType === 'agent')
      .map((m) => m.memberId)
      .filter((id): id is string => Boolean(id && typeof id === 'string'));
    const agentsInRoom = roomAgentIds.length
      ? await this.agentsRepo.find({
          where: { companyId, status: 'active', id: In(roomAgentIds) },
          select: ['id', 'name', 'role', 'organizationNodeId', 'expertise'],
        })
      : [];
    const remainingSlots = Math.max(0, maxCandidates - agentsInRoom.length);
    let agentsBeyondRoom: Agent[] = [];
    if (remainingSlots > 0) {
      const qb = this.agentsRepo
        .createQueryBuilder('a')
        .where('a.company_id = :companyId', { companyId })
        .andWhere('a.status = :status', { status: 'active' })
        .select(['a.id', 'a.name', 'a.role', 'a.organization_node_id', 'a.expertise'])
        .orderBy('a.created_at', 'DESC')
        .take(remainingSlots);
      if (roomAgentIds.length) {
        qb.andWhere('a.id NOT IN (:...roomAgentIds)', { roomAgentIds });
      }
      agentsBeyondRoom = await qb.getMany();
    }
    const pool = [...agentsInRoom, ...agentsBeyondRoom].filter(
      (a, idx, arr) => arr.findIndex((x) => x.id === a.id) === idx,
    );
    let tenantAliases: MentionAliasConfig[] = [];
    try {
      tenantAliases = await this.mentionAliasesService.list(companyId);
    } catch {
      tenantAliases = [];
    }
    const resolved = this.mentionResolver.resolveMentions({
      content,
      ceoAgentId: null,
      aliases: tenantAliases,
      candidates: pool.map((a) => ({
        agentId: a.id,
        name: a.name,
        role: a.role,
        expertise: a.expertise ?? null,
        organizationNodeId: a.organizationNodeId,
      })),
    });
    const filtered = this.filterExistingAgentMentions(
      [...inlineIds, ...resolved.agentIds, ...ids],
      pool.map((a) => ({ id: a.id })),
    );
    for (const id of filtered.validAgentIds) ids.add(id);
    for (const nodeId of resolved.nodeIds) nodeIds.add(nodeId);
    const validNodeIds = new Set(pool.map((a) => a.organizationNodeId).filter(Boolean));
    const normalizedNodeIds = [...nodeIds].filter((id) => validNodeIds.has(id));
    if (filtered.droppedAgentIds.length > 0) {
      this.logger.warn('Dropping unknown/inactive mentionedAgentIds', {
        companyId,
        roomId,
        droppedCount: filtered.droppedAgentIds.length,
        droppedAgentIds: filtered.droppedAgentIds.slice(0, 8),
      });
    }
    return {
      mentionedAgentIds: [...ids],
      mentionedNodeIds: normalizedNodeIds,
      resolvedFrom: resolved.resolvedFrom,
      confidence: resolved.confidence,
      labels: resolved.labels,
    };
  }

  async sendHumanMessage(
    companyId: string,
    actor: ActorRef,
    dto: SendChatMessageDto,
  ): Promise<ChatMessage> {
    const room = await this.rooms.findOneOrFail(companyId, dto.roomId);
    const allowed = await this.members.isActiveMember(
      companyId,
      dto.roomId,
      'human',
      actor.id,
    );
    if (!allowed) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权在此房间发送消息',
      });
    }
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    const companyRole = membership?.role ?? null;
    const principalRole = this.roleRouting.toPrincipalRole(companyRole);
    const isLeader = this.roleRouting.isLeader(companyRole);
    if (room.roomType === 'main' && !isLeader) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '主群仅 CEO/主管（Owner/Admin/Supervisor）可发言',
      });
    }
    const groupPolicy =
      room.metadata &&
      typeof room.metadata === 'object' &&
      (room.metadata as Record<string, unknown>).groupPolicy &&
      typeof (room.metadata as Record<string, unknown>).groupPolicy === 'object'
        ? ((room.metadata as Record<string, unknown>).groupPolicy as Record<string, unknown>)
        : {};
    if (
      room.roomType === 'department' &&
      groupPolicy.upgradeTemplateRequired === true &&
      this.looksLikeUpgradeRequest(dto.content) &&
      !this.hasUpgradeTemplate(dto.content)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '升级请求必须使用固定模板：背景/当前影响/需要谁在何时决策',
      });
    }
    if (dto.threadId) {
      const th = await this.threads.findOneOrFail(companyId, dto.threadId);
      if (th.roomId !== dto.roomId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '线程不属于该房间',
        });
      }
    }
    const mention = await this.resolveMentions(companyId, dto.roomId, dto.content);
    const messageCategory = this.resolveHumanMessageCategory(dto, room.roomType);
    const routeTarget = this.roleRouting.resolveDefaultRoute({
      principalRole,
      roomType: room.roomType,
      messageCategory,
    });
    const baseMetadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
      messageCategory,
      principalRole,
      routeTarget,
      ...(mention.mentionedAgentIds.length ? { mentionedAgentIds: mention.mentionedAgentIds } : {}),
      ...(mention.mentionedNodeIds.length ? { mentionedNodeIds: mention.mentionedNodeIds } : {}),
      ...(mention.resolvedFrom ? { mentionResolvedFrom: mention.resolvedFrom } : {}),
      ...(typeof mention.confidence === 'number' ? { mentionResolveConfidence: mention.confidence } : {}),
      ...(mention.labels?.length ? { mentionLabels: mention.labels } : {}),
    };
    const messageId = randomUUID();
    const audienceDecision = this.audienceRouter.decide({
      companyId,
      room,
      messageId,
      messageCategory,
      metadata: baseMetadata,
    });
    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      audienceDecision,
      processingStatus: {
        stage: 'received',
        mode: 'unknown',
        visibility: 'user_facing',
        updatedAt: new Date().toISOString(),
      },
      ...(mention.mentionedAgentIds.length ? { mentionedAgentIds: mention.mentionedAgentIds } : {}),
      ...(mention.mentionedNodeIds.length ? { mentionedNodeIds: mention.mentionedNodeIds } : {}),
      ...(mention.resolvedFrom ? { mentionResolvedFrom: mention.resolvedFrom } : {}),
      ...(typeof mention.confidence === 'number' ? { mentionResolveConfidence: mention.confidence } : {}),
      ...(mention.labels?.length ? { mentionLabels: mention.labels } : {}),
    };
    return this.appendMessage(companyId, dto.roomId, {
      id: messageId,
      senderType: 'human',
      senderId: actor.id,
      messageType: dto.messageType ?? 'text',
      content: dto.content,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      threadId: dto.threadId ?? null,
    });
  }

  /**
   * 人类发消息：客户端显式 `metadata.messageCategory` 优先于服务端启发式分类。
   * Chat-first：`task_publish` 不再接受客户端传入，由 Replay / 确认执行路径在 Worker 侧标记。
   */
  resolveHumanMessageCategory(
    dto: Pick<SendChatMessageDto, 'content' | 'metadata'>,
    roomType: string,
  ): IntentMessageCategory | 'upgrade_request' | 'execution_detail' | 'decision' {
    const raw = dto.metadata?.messageCategory;
    if (typeof raw === 'string') {
      const trimmed = raw.trim() as IntentMessageCategory;
      if (trimmed === 'task_publish') {
        // 忽略客户端 task_publish Tab；走默认分类
      } else if (CLIENT_MESSAGE_CATEGORIES.has(trimmed)) {
        return trimmed;
      }
    }
    return this.classifyMessageCategory(dto.content, roomType);
  }

  private classifyMessageCategory(
    content: string,
    roomType: string,
  ): 'upgrade_request' | 'execution_detail' | 'decision' {
    const t = content.toLowerCase();
    if (this.looksLikeUpgradeRequest(content)) return 'upgrade_request';
    if (roomType === 'main' && /执行|实现|步骤|排期|代码|细节|日志|报错|联调/.test(t)) {
      return 'execution_detail';
    }
    return 'decision';
  }

  private looksLikeUpgradeRequest(content: string): boolean {
    return /升级|需要ceo决策|跨部门|升级请求|决策请求/i.test(content);
  }

  private hasUpgradeTemplate(content: string): boolean {
    return /背景[:：]/i.test(content) && /影响[:：]/i.test(content) && /(需要谁|决策人)[:：]/i.test(content);
  }

  /**
   * Agent / 系统写入（内部调用，由 Worker 或后续 Agent 编排使用）
   */
  async appendAgentMessage(
    companyId: string,
    roomId: string,
    agentId: string,
    content: string,
    messageType: ChatMessageType = 'text',
    metadata?: Record<string, unknown> | CollaborationAppendAgentMetadataDto,
    threadId?: string | null,
    memoryReferences?: ChatMemoryReference[] | null,
  ): Promise<ChatMessage> {
    const metaPlain: Record<string, unknown> =
      metadata && typeof metadata === 'object'
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    const mention = await this.resolveMentions(companyId, roomId, content);
    const mergedMentionedAgentIds = Array.from(
      new Set([
        ...(
          Array.isArray(metaPlain?.mentionedAgentIds)
            ? metaPlain.mentionedAgentIds.filter((x): x is string => typeof x === 'string')
            : []
        ),
        ...mention.mentionedAgentIds,
      ]),
    );
    const mergedMentionedNodeIds = Array.from(
      new Set([
        ...(
          Array.isArray(metaPlain?.mentionedNodeIds)
            ? metaPlain.mentionedNodeIds.filter((x): x is string => typeof x === 'string')
            : []
        ),
        ...mention.mentionedNodeIds,
      ]),
    );
    const mergedMetadata: Record<string, unknown> = {
      ...metaPlain,
      ...(mergedMentionedAgentIds.length ? { mentionedAgentIds: mergedMentionedAgentIds } : {}),
      ...(mergedMentionedNodeIds.length ? { mentionedNodeIds: mergedMentionedNodeIds } : {}),
      ...(mention.resolvedFrom ? { mentionResolvedFrom: mention.resolvedFrom } : {}),
      ...(typeof mention.confidence === 'number' ? { mentionResolveConfidence: mention.confidence } : {}),
      ...(mention.labels?.length ? { mentionLabels: mention.labels } : {}),
    };
    const persistedMeta = sanitizeAppendAgentMetadataForPersist(mergedMetadata);
    return this.appendMessage(companyId, roomId, {
      senderType: 'agent',
      senderId: agentId,
      messageType,
      content,
      metadata: Object.keys(persistedMeta).length ? persistedMeta : undefined,
      threadId: threadId ?? null,
      memoryReferences: memoryReferences?.length ? memoryReferences : null,
    });
  }

  /**
   * 系统类消息（以操作者身份落库，便于审计；内容可为「某部门已加入」等）。
   * 调用方已做过授权校验。
   */
  async appendSystemMessageAsActor(
    companyId: string,
    roomId: string,
    actorUserId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    return this.appendMessage(companyId, roomId, {
      senderType: 'human',
      senderId: actorUserId,
      messageType: 'system',
      content,
      metadata,
    });
  }

  async findMessageById(companyId: string, messageId: string): Promise<ChatMessage> {
    const row = await this.messagesRepo.findOne({
      where: { id: messageId, companyId },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '消息不存在',
      });
    }
    return row;
  }

  async patchMessageMetadata(
    companyId: string,
    messageId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatMessage> {
    const row = await this.findMessageById(companyId, messageId);
    row.metadata = { ...(row.metadata ?? {}), ...patch };
    const saved = await this.messagesRepo.save(row);
    await this.collabRealtime.publishMessageMetadataUpdated(companyId, saved);
    return saved;
  }

  private async appendMessage(
    companyId: string,
    roomId: string,
    params: {
      id?: string;
      senderType: ChatSenderType;
      senderId: string;
      messageType: ChatMessageType;
      content: string;
      metadata?: Record<string, unknown>;
      threadId?: string | null;
      memoryReferences?: ChatMemoryReference[] | null;
    },
  ): Promise<ChatMessage> {
    const messageId = params.id ?? randomUUID();
    const saved = await this.dataSource.transaction(async (manager) => {
      const upd = await manager.query(
        `
        UPDATE chat_rooms
        SET message_seq = COALESCE(message_seq, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2
        RETURNING message_seq
        `,
        [roomId, companyId],
      );
      const seqRow = firstRowFromTypeOrmRawQuery(upd);
      const nextSeq = seqRow?.message_seq;
      if (nextSeq == null) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '房间不存在或无法分配序号',
        });
      }
      const row = manager.create(ChatMessage, {
        id: messageId,
        companyId,
        roomId,
        threadId: params.threadId ?? null,
        seq: String(nextSeq),
        senderType: params.senderType,
        senderId: params.senderId,
        messageType: params.messageType,
        content: params.content,
        metadata: params.metadata ?? null,
        memoryReferences: params.memoryReferences ?? null,
      });
      return manager.save(ChatMessage, row);
    });

    await this.publishPostMessageHooks(companyId, saved);
    return saved;
  }

  private async publishPostMessageHooks(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    const isStreamChunk = message.messageType === 'stream_chunk';
    if (isStreamChunk) {
      await this.collabRealtime.publishMessageChunk(companyId, message);
      return;
    }

    await this.processMessageSideEffects(companyId, message);
    await this.collabRealtime.publishMessage(companyId, message);
  }

  private async processMessageSideEffects(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    try {
      await this.messageProcessingOrchestrator.process(companyId, message);
    } catch (error: unknown) {
      this.logger.error('message.post_processing_failed', {
        companyId,
        messageId: message.id,
        roomId: message.roomId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }


  async listMessages(
    companyId: string,
    dto: ListChatMessagesDto,
  ): Promise<{ items: ChatMessage[]; hasMore: boolean }> {
    await this.rooms.findOneOrFail(companyId, dto.roomId);
    const limit = Math.min(dto.limit ?? 50, 200);
    const qb = this.messagesRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.room_id = :roomId', { roomId: dto.roomId })
      .andWhere("m.message_type <> 'stream_chunk'");
    const threadFilter = String(dto.threadId ?? '').trim();
    if (threadFilter && threadFilter.toLowerCase() !== 'main') {
      qb.andWhere('m.thread_id = :threadId', { threadId: threadFilter });
    } else if (threadFilter.toLowerCase() === 'main') {
      qb.andWhere('m.thread_id IS NULL');
    }
    qb.orderBy('m.seq', 'DESC').take(limit + 1);
    if (dto.beforeSeq != null) {
      qb.andWhere('m.seq < :beforeSeq', { beforeSeq: dto.beforeSeq });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    items.reverse();
    return { items, hasMore };
  }

  /**
   * 关键词（全文检索 simple）+ 发送方 + 时间范围 + 分页。
   * 需已执行迁移 `CollaborationMessagesSearchAndIndexes`（content_tsv 列）。
   */
  async searchMessages(
    companyId: string,
    dto: SearchChatMessagesDto,
  ): Promise<{
    items: ChatMessage[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.rooms.findOneOrFail(companyId, dto.roomId);
    const pageSize = Math.min(dto.limit ?? 30, 100);
    const page = dto.page ?? 1;
    const qb = this.messagesRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.room_id = :roomId', { roomId: dto.roomId });
    if (dto.q?.trim()) {
      qb.andWhere(`m.content_tsv @@ plainto_tsquery('simple', :tsq)`, {
        tsq: dto.q.trim(),
      });
    }
    if (dto.senderType) {
      qb.andWhere('m.sender_type = :st', { st: dto.senderType });
    }
    if (dto.senderId) {
      qb.andWhere('m.sender_id = :sid', { sid: dto.senderId });
    }
    if (dto.from) {
      qb.andWhere('m.created_at >= :from', { from: new Date(dto.from) });
    }
    if (dto.to) {
      qb.andWhere('m.created_at <= :to', { to: new Date(dto.to) });
    }
    const total = await qb.getCount();
    const items = await qb
      .clone()
      .orderBy('m.seq', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return { items, total, page, pageSize };
  }
}
