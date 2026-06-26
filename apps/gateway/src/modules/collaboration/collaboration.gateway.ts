import { BadRequestException, Inject, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { firstValueFrom, timeout } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import {
  createAgentMessage,
  AgentMessageSchema,
  MessageIntent,
  validateAgentMessage,
  type AgentMessage,
} from '@foundry/multi-agent-core';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { TokenService } from '../auth/services/token.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { WsTenantGuard } from '../../common/guards/ws-tenant.guard.js';

const RPC_TIMEOUT_MS = 15000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractBearer(authHeader: string | undefined): string | undefined {
  if (!authHeader || typeof authHeader !== 'string') return undefined;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

function socketRoomName(companyId: string, roomId: string): string {
  return `collab:${companyId}:${roomId}`;
}

function taskCompanyRoomName(companyId: string): string {
  return `tasks:company:${companyId}`;
}

@Public()
@WebSocketGateway({
  namespace: '/collaboration',
  cors: { origin: true, credentials: true },
})
export class CollaborationGateway implements OnGatewayConnection {
  private readonly logger = new Logger(CollaborationGateway.name);

  private disconnectSoon(client: Socket, delayMs = 25): void {
    // Give Socket.IO a short window to flush `error` event frames
    // before we forcefully disconnect the transport.
    setTimeout(() => {
      try {
        client.disconnect(true);
      } catch {
        // ignore
      }
    }, delayMs);
  }

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(API_RPC_CLIENT) private readonly api: ClientProxy,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly wsTenantGuard: WsTenantGuard,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.debug('Collaboration WS connection attempt', {
      socketId: client.id,
      namespace: client.nsp?.name,
      origin: client.handshake.headers?.origin,
      userAgent: client.handshake.headers?.['user-agent'],
      hasAuth: !!client.handshake.auth,
      authKeys: client.handshake.auth ? Object.keys(client.handshake.auth as any) : [],
      queryKeys: client.handshake.query ? Object.keys(client.handshake.query as any) : [],
    });
    try {
      const rawAuth = client.handshake.auth as Record<string, unknown> | undefined;
      const token =
        (typeof rawAuth?.token === 'string' && rawAuth.token) ||
        extractBearer(client.handshake.headers?.authorization as string | undefined);
      const companyIdRaw =
        (typeof rawAuth?.companyId === 'string' && rawAuth.companyId) ||
        (typeof client.handshake.query.companyId === 'string' &&
          client.handshake.query.companyId);
      if (!token || !companyIdRaw) {
        client.emit('error', {
          code: 'BAD_REQUEST',
          message: 'WebSocket auth missing token/companyId',
        });
        this.logger.warn('Collaboration WS missing auth context', {
          socketId: client.id,
          hasToken: Boolean(token),
          hasCompanyId: Boolean(companyIdRaw),
        });
        this.disconnectSoon(client);
        return;
      }
      let payload: { sub: string };
      try {
        payload = await this.tokenService.verifyAccessToken(token);
      } catch (e: any) {
        client.emit('error', {
          code: 'UNAUTHORIZED',
          message: e?.message ?? 'Invalid access token',
        });
        this.logger.warn('Collaboration WS token verification failed', {
          socketId: client.id,
          companyId: companyIdRaw,
          message: e?.message,
        });
        this.disconnectSoon(client);
        return;
      }

      let user: { id: string } | null;
      try {
        user = await this.authService.validateUser(payload.sub);
      } catch (e: any) {
        client.emit('error', {
          code: 'UNAUTHORIZED',
          message: e?.message ?? 'User validation failed',
        });
        this.disconnectSoon(client);
        return;
      }
      if (!user?.id) {
        client.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Unknown user',
        });
        this.disconnectSoon(client);
        return;
      }
      try {
        await this.wsTenantGuard.assertMembershipOrThrow({
          userId: user.id,
          companyId: companyIdRaw,
          event: 'handleConnection',
          socketId: client.id,
        });
      } catch (e: any) {
        client.emit('error', {
          code: 'FORBIDDEN',
          message: e?.message ?? 'forbidden tenant access',
        });
        this.logger.warn('Collaboration WS tenant guard failed', {
          socketId: client.id,
          userId: user.id,
          companyId: companyIdRaw,
          message: e?.message,
        });
        this.disconnectSoon(client);
        return;
      }
      client.data.userId = user.id;
      client.data.companyId = companyIdRaw;
      const userRoles = Array.isArray((user as any)?.roles)
        ? (user as any).roles.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0)
        : [];
      client.data.roles = userRoles;
      client.emit('session_ready', { companyId: companyIdRaw, userId: user.id });
      this.logger.debug('Collaboration WS authenticated', {
        socketId: client.id,
        userId: user.id,
        companyId: companyIdRaw,
      });
    } catch (e: any) {
      this.logger.warn('Collaboration WS auth failed', { message: e?.message });
      try {
        client.emit('error', {
          code: 'UNAUTHORIZED',
          message: e?.message ?? 'Collaboration WS auth failed',
        });
      } catch {
        // ignore
      }
      this.disconnectSoon(client);
    }
  }

  /** 订阅全公司任务进度推送（与 Redis collab:notify 中 task:progress 事件配合） */
  @SubscribeMessage('join_company_tasks')
  async joinCompanyTasks(
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: boolean; companyId?: string; code?: string; message?: string }> {
    const userId = client.data.userId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    if (!userId || !companyId) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 companyId' });
      return { ok: false, code: 'BAD_REQUEST', message: 'missing companyId or userId' };
    }
    try {
      await this.wsTenantGuard.assertMembershipOrThrow({
        userId,
        companyId,
        event: 'join_company_tasks',
        socketId: client.id,
      });
    } catch {
      client.emit('error', { code: 'FORBIDDEN', message: 'forbidden tenant access' });
      return { ok: false, code: 'FORBIDDEN', message: 'forbidden tenant access' };
    }
    await client.join(taskCompanyRoomName(companyId));
    client.emit('joined_tasks', { companyId });
    return { ok: true, companyId };
  }

  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    const roomId = body?.roomId;
    if (!userId || !companyId || !roomId) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少上下文或 roomId' });
      return;
    }
    try {
      const members = await firstValueFrom(
        this.api
          .send<
            Array<{ memberType: string; memberId: string }>
          >('collaboration.members.list', {
            actor: { id: userId },
            companyId,
            roomId,
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
      const allowed = members.some(
        (m) => m.memberType === 'human' && m.memberId === userId,
      );
      if (!allowed) {
        client.emit('error', { code: 'FORBIDDEN', message: '不在该协作房间内' });
        return;
      }
      const room = socketRoomName(companyId, roomId);
      await client.join(room);
      const socketsInRoom = this.server.sockets.adapter.rooms.get(room);
      this.logger.debug('join_room success', {
        socketId: client.id,
        userId,
        companyId,
        roomId,
        room,
        socketsInRoom: socketsInRoom?.size ?? 0,
      });
      client.emit('joined', { roomId });
    } catch (e: any) {
      this.logger.warn('join_room RPC failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'join failed' });
    }
  }

  /** 离开协作房间（切换房间前应调用，避免 Socket.IO 客户端滞留多个房间收到串台消息） */
  @SubscribeMessage('leave_room')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    const companyId = client.data.companyId as string | undefined;
    const roomId = body?.roomId;
    if (!companyId || !roomId) {
      return;
    }
    try {
      await client.leave(socketRoomName(companyId, roomId));
      client.emit('left', { roomId });
    } catch (e: any) {
      this.logger.warn('leave_room failed', { message: e?.message });
    }
  }

  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { roomId?: string; content?: string; messageType?: string; threadId?: string },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    if (!userId || !companyId || !body?.roomId || !body?.content) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 roomId 或 content' });
      return;
    }
    try {
      const saved = await firstValueFrom(
        this.api
          .send<Record<string, unknown>>('collaboration.messages.send', {
            actor: { id: userId },
            companyId,
            roomId: body.roomId,
            content: body.content,
            messageType: body.messageType ?? 'text',
            ...(body.threadId ? { threadId: body.threadId } : {}),
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
      await this.publishAcpMessageIfEnabled(client, body.roomId, body.content);
      if (!this.configService.isCollaborationRedisNotifyEnabled()) {
        this.server
          .to(socketRoomName(companyId, body.roomId))
          .emit('message:new', saved);
      }
    } catch (e: any) {
      this.logger.warn('send_message RPC failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'send failed' });
    }
  }

  @SubscribeMessage('task_intent:patch_spec')
  async patchTaskIntentSpec(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      candidateId?: string;
      patch?: Record<string, unknown>;
    },
  ): Promise<{ ok: boolean; result?: unknown; code?: string; message?: string }> {
    const userId = client.data.userId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    const roles = Array.isArray(client.data.roles)
      ? client.data.roles.filter((r: unknown): r is string => typeof r === 'string')
      : [];
    const candidateId = typeof body?.candidateId === 'string' ? body.candidateId.trim() : '';
    if (!userId || !companyId || !UUID_RE.test(candidateId) || !body?.patch || typeof body.patch !== 'object') {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 candidateId 或 patch' });
      return { ok: false, code: 'BAD_REQUEST', message: 'missing candidateId or patch' };
    }
    try {
      const result = await firstValueFrom(
        this.api
          .send('collaboration.taskIntentCandidates.patchSpec', {
            actor: { id: userId, roles },
            companyId,
            candidateId,
            patch: body.patch,
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
      client.emit('task_intent:updated', result);
      return { ok: true, result };
    } catch (e: any) {
      this.logger.warn('task_intent:patch_spec RPC failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'patch task intent failed' });
      return { ok: false, code: 'RPC_ERROR', message: e?.message ?? 'patch task intent failed' };
    }
  }

  @SubscribeMessage('task_intent:confirm')
  async confirmTaskIntent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { candidateId?: string },
  ): Promise<{ ok: boolean; result?: unknown; code?: string; message?: string }> {
    const userId = client.data.userId as string | undefined;
    const companyId = client.data.companyId as string | undefined;
    const roles = Array.isArray(client.data.roles)
      ? client.data.roles.filter((r: unknown): r is string => typeof r === 'string')
      : [];
    const candidateId = typeof body?.candidateId === 'string' ? body.candidateId.trim() : '';
    if (!userId || !companyId || !UUID_RE.test(candidateId)) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 candidateId' });
      return { ok: false, code: 'BAD_REQUEST', message: 'missing candidateId' };
    }
    try {
      const result = await firstValueFrom(
        this.api
          .send('collaboration.taskIntentCandidates.confirm', {
            actor: { id: userId, roles },
            companyId,
            candidateId,
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
      client.emit('task_intent:updated', result);
      return { ok: true, result };
    } catch (e: any) {
      this.logger.warn('task_intent:confirm RPC failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'confirm task intent failed' });
      return { ok: false, code: 'RPC_ERROR', message: e?.message ?? 'confirm task intent failed' };
    }
  }

  /**
   * Phase 1: accept standardized ACP messages over WebSocket.
   * Zero-break: guarded by ENABLE_ACP_PROTOCOL; legacy events remain unchanged.
   */
  @SubscribeMessage('agent-message')
  async receiveAgentMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.configService.isAcpProtocolEnabled()) {
      client.emit('error', { code: 'FORBIDDEN', message: 'ACP protocol disabled' });
      return;
    }
    const companyId = client.data.companyId as string | undefined;
    if (!companyId) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 companyId' });
      return;
    }
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.emit('error', { code: 'FORBIDDEN', message: '未认证' });
      return;
    }

    const parsed = AgentMessageSchema.safeParse(body);
    if (!parsed.success) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'Invalid agent message format' });
      return;
    }
    const message = parsed.data;
    if (message.context?.companyId !== companyId) {
      client.emit('error', { code: 'FORBIDDEN', message: 'companyId mismatch' });
      return;
    }

    // WS hard isolation: temporary agents must only speak in their bound project rooms.
    try {
      const fromAgentId = String((message as any)?.fromAgentId ?? '').trim();
      const roomId = String((message as any)?.context?.sessionId ?? '').trim();
      if (UUID_RE.test(fromAgentId) && UUID_RE.test(roomId)) {
        const [agent, room] = await Promise.all([
          firstValueFrom(
            this.api
              .send<{ metadata?: Record<string, unknown> | null }>('agents.findOne', {
                actor: { id: userId },
                companyId,
                id: fromAgentId,
              })
              .pipe(timeout(RPC_TIMEOUT_MS)),
          ),
          firstValueFrom(
            this.api
              .send<{ taskId?: string | null }>('collaboration.rooms.findOne', {
                actor: { id: userId },
                companyId,
                roomId,
              })
              .pipe(timeout(RPC_TIMEOUT_MS)),
          ),
        ]);
        const meta = (agent as any)?.metadata as Record<string, unknown> | null | undefined;
        const employmentType =
          meta && typeof meta['employmentType'] === 'string' ? String(meta['employmentType']) : 'permanent';
        const boundProjectId = meta && typeof meta['projectId'] === 'string' ? String(meta['projectId']) : '';
        const roomProjectId = String((room as any)?.taskId ?? '').trim();
        if (employmentType === 'temporary') {
          if (!boundProjectId || !roomProjectId || boundProjectId !== roomProjectId) {
            client.emit('error', { code: 'FORBIDDEN', message: 'Temporary Agent 项目范围不匹配' });
            return;
          }
        }
      }
    } catch (e: any) {
      // Fail closed for agent-message: we prefer early rejection over letting a scoped agent slip through.
      this.logger.warn('agent-message scope validation failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'scope validation failed' });
      return;
    }

    // Re-validate via exported validator (keeps one canonical path).
    const validation = validateAgentMessage(message);
    if (!validation.success) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'Invalid agent message format' });
      return;
    }

    // Publish to API bridge → MQ → Worker.
    try {
      await firstValueFrom(
        this.api
          .emit<AgentMessage>('collaboration.agent-message.received', message)
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (e: any) {
      this.logger.warn('agent-message publish failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'publish failed' });
      return;
    }

    // Optional local echo (useful for debugging clients).
    client.emit('agent-message:accepted', { messageId: message.messageId, traceId: message.traceId });
  }

  broadcastMessageNew(
    companyId: string,
    roomId: string,
    message: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const room = socketRoomName(companyId, roomId);
    const socketsInRoom = this.server.sockets.adapter.rooms.get(room);
    this.logger.debug('broadcastMessageNew', {
      companyId,
      roomId,
      room,
      socketCount: socketsInRoom?.size ?? 0,
      messageId: (message as any)?.id,
    });
    this.emitAgentMessageIfEnabled(companyId, roomId, message);
    this.server.to(room).emit('message:new', message);
  }

  /** API metadata patch（ceoAlignment / replayDecision / taskIntentCandidate） */
  emitMessageMetadataUpdated(
    companyId: string,
    roomId: string,
    message: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('message:metadata_updated', message);
  }

  /** API `publishEnvelope`：主群草稿更新；房间 + 公司任务频道双播（与审批一致，依赖 `join_company_tasks`） */
  emitMainRoomDraftUpdated(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const body = { companyId, roomId, ...payload };
    this.server.to(socketRoomName(companyId, roomId)).emit('main_room_draft:updated', body);
    this.server.to(taskCompanyRoomName(companyId)).emit('main_room_draft:updated', body);
  }

  /** Dispatch Plan v2 草稿更新；与 `main_room_draft:updated` 一样双播 */
  emitDispatchPlanDraftUpdated(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const body = { companyId, roomId, ...payload };
    this.server.to(socketRoomName(companyId, roomId)).emit('dispatch_plan_draft:updated', body);
    this.server.to(taskCompanyRoomName(companyId)).emit('dispatch_plan_draft:updated', body);
  }

  /** 主群派发部分部门跳过（metadata 已 patch；此事件供侧栏/横幅即时刷新） */
  emitDispatchPartialFailed(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const body = { companyId, roomId, ...payload };
    this.server.to(socketRoomName(companyId, roomId)).emit('dispatch:partial_failed', body);
    this.server.to(taskCompanyRoomName(companyId)).emit('dispatch:partial_failed', body);
  }

  /** 房间协作模式变更（Ask/Agent 等）；与 `main_room_draft:updated` 一样双播房间 + 公司任务频道 */
  emitCollaborationModeUpdated(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const body = { companyId, roomId, ...payload };
    this.server.to(socketRoomName(companyId, roomId)).emit('collaboration_mode:updated', body);
    this.server.to(taskCompanyRoomName(companyId)).emit('collaboration_mode:updated', body);
  }

  private buildTraceIdFromSocket(client: Socket): string {
    const headerTraceId = client.handshake.headers?.['x-trace-id'];
    const traceId =
      (Array.isArray(headerTraceId) ? headerTraceId[0] : headerTraceId) ??
      (typeof client.data.traceId === 'string' ? client.data.traceId : undefined);
    return typeof traceId === 'string' && traceId.trim().length > 0 ? traceId : randomUUID();
  }

  private emitAgentMessageIfEnabled(companyId: string, roomId: string, payload: Record<string, unknown>): void {
    if (!this.configService.isAcpProtocolEnabled()) return;
    const message = this.sendMessageViaACP(
      'system.gateway',
      'broadcast',
      MessageIntent.TASK_UPDATE,
      payload,
      { companyId, sessionId: roomId },
    );
    this.server.to(socketRoomName(companyId, roomId)).emit('agent-message', message);
  }

  private async publishAcpMessageIfEnabled(
    client: Socket,
    roomId: string,
    content: string,
  ): Promise<void> {
    if (!this.configService.isAcpProtocolEnabled()) return;
    const userId = String(client.data.userId ?? '');
    const companyId = String(client.data.companyId ?? '');
    if (!userId || !companyId) return;
    const message = this.sendMessageViaACP(
      userId,
      'broadcast',
      MessageIntent.TASK_UPDATE,
      { roomId, content },
      { companyId, sessionId: roomId },
      { traceId: this.buildTraceIdFromSocket(client) },
    );
    await firstValueFrom(
      this.api.emit<AgentMessage>('collaboration.agent-message.received', message).pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  sendMessageViaACP(
    fromAgentId: string,
    toAgentId: string | 'broadcast',
    intent: MessageIntent,
    payload: Record<string, unknown>,
    context: { companyId: string; sessionId?: string },
    options?: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      ttl?: number;
      traceId?: string;
    },
  ): AgentMessage {
    const message = createAgentMessage({
      traceId: options?.traceId ?? randomUUID(),
      fromAgentId,
      toAgentId,
      intent,
      payload,
      context,
      ...(options?.priority ? { priority: options.priority } : {}),
      ...(options?.ttl ? { ttl: options.ttl } : {}),
    });
    const validation = validateAgentMessage(message);
    if (!validation.success) {
      this.logger.error('ACP validation failed', { errors: validation.error.issues });
      throw new BadRequestException('Invalid agent message format');
    }
    return message;
  }

  /** Human-in-the-loop：与 MQ 中 {@link AgentNeedApprovalEvent} 并行推送到在线客户端 */
  emitApprovalNeeded(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('approval:needed', payload);
    /** 与 `join_company_tasks` 同播：未打开聊天室也能刷新审批中心 / Hall 角标 */
    this.server.to(taskCompanyRoomName(companyId)).emit('approval:needed', payload);
  }

  /** API Redis 事件 `approval:status`：同步审批终态到房间内所有客户端 */
  emitApprovalResolved(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    const room = socketRoomName(companyId, roomId);
    this.server.to(room).emit('approval:resolved', payload);
    this.server.to(taskCompanyRoomName(companyId)).emit('approval:resolved', payload);
  }

  /**
   * Worker / 内部服务可经 HTTP 管理面调用 RPC；网关在收到流式块时可由后续 CollaborationStreamService 调用此方法广播。
   */
  emitMessageChunk(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('message:chunk', payload);
  }

  emitTaskProgress(companyId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit('task:progress', payload);
  }

  emitRunStepAppended(companyId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit('run:step.appended', payload);
  }

  emitRunStep(
    event: 'run:step.started' | 'run:step.completed' | 'run:step.failed',
    companyId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit(event, payload);
  }

  emitRunUpdated(companyId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit('run:updated', payload);
  }

  emitRunTerminal(
    event: 'run:succeeded' | 'run:failed',
    companyId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit(event, payload);
  }

  emitRunIntervention(companyId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit('run:intervention', payload);
  }

  /** 组织树变更提示：与 `join_company_tasks` 同一房间，便于客户端刷新组织/Agent 视图 */
  emitOrgStructureChanged(companyId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit('org:structure_changed', payload);
  }

  /** 群聊关联任务（metadata.roomId）上的进度，可与协作房间共用 Socket 连接 */
  emitTaskProgressForRoom(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('task:progress', payload);
  }

  emitOrchestrationUpdated(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('orchestration:updated', payload);
  }

  emitResponderThinking(
    companyId: string,
    roomId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('responder:thinking', payload);
  }

  emitMemoryEvent(
    event: 'memory:ingested' | 'memory:consolidated' | 'memory:retrieved' | 'memory:conflict_detected',
    companyId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server.to(taskCompanyRoomName(companyId)).emit(event, payload);
  }

  emitAgentMessageAck(companyId: string, roomId: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(socketRoomName(companyId, roomId)).emit('agent-message-acked', payload);
  }

  /**
   * Phase 5 (feature-flagged): human-in-the-loop response from group chat / approval center UI.
   * Publishes to Redis `approval:result:<companyId>:<approvalId>` so tenant-scoped waiters wake up.
   */
  @SubscribeMessage('approval.response')
  async handleApprovalResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { approvalId?: string; approved?: boolean; reason?: string },
  ): Promise<{ ok: boolean; approvalId?: string; approved?: boolean; code?: string; message?: string }> {
    this.logger.log('approval.response received', {
      socketId: client.id,
      hasBody: !!body,
    });
    if (!this.configService.isAdvancedApprovalEnabled()) {
      client.emit('error', { code: 'FORBIDDEN', message: 'advanced approval disabled' });
      return { ok: false, code: 'FORBIDDEN', message: 'advanced approval disabled' };
    }
    const companyId = client.data.companyId as string | undefined;
    const userId = client.data.userId as string | undefined;
    const roles = Array.isArray(client.data.roles)
      ? client.data.roles.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0)
      : [];
    const approvalId = typeof body?.approvalId === 'string' ? body.approvalId.trim() : '';
    const approved = Boolean(body?.approved);
    if (!companyId || !approvalId || !userId) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'missing companyId or approvalId' });
      return { ok: false, code: 'BAD_REQUEST', message: 'missing companyId or approvalId' };
    }

    try {
      const approval = await firstValueFrom(
        this.api
          .send<{ actionType?: string; status?: string }>('approval.findOne', {
            companyId,
            actor: {
              id: userId,
              roles,
            },
            approvalId,
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
      const actionType =
        typeof approval?.actionType === 'string' && approval.actionType.trim().length > 0
          ? approval.actionType.trim()
          : 'unknown';

      if (approved) {
        await firstValueFrom(
          this.api
            .send('approval.approve', {
              companyId,
              actor: {
                id: userId,
                roles,
              },
              approvalId,
              action: actionType,
            })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      } else {
        await firstValueFrom(
          this.api
            .send('approval.reject', {
              companyId,
              actor: {
                id: userId,
                roles,
              },
              approvalId,
              reason: typeof body?.reason === 'string' ? body.reason : undefined,
            })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      }
    } catch (e: any) {
      const rawMsg = String(e?.message ?? '').toLowerCase();
      const statusCode = Number(e?.status ?? e?.code ?? 0);
      const conflictNotPending = statusCode === 409 && rawMsg.includes('approval not pending');
      const alreadyApproved =
        approved &&
        (rawMsg.includes('approval not pending: approved') || conflictNotPending);
      const alreadyRejected =
        !approved &&
        (rawMsg.includes('approval not pending: rejected') || conflictNotPending);
      if (alreadyApproved || alreadyRejected) {
        this.logger.log('approval.response idempotent accepted', {
          companyId,
          approvalId,
          userId,
          approved,
          message: e?.message,
        });
        client.emit('approval.response.received', {
          approvalId,
          approved,
          status: approved ? 'approved' : 'rejected',
          idempotent: true,
        });
        this.server.to(taskCompanyRoomName(companyId)).emit('approval.updated', {
          approvalId,
          approvalRequestId: approvalId,
          approved,
          status: approved ? 'approved' : 'rejected',
          reason: body?.reason,
          idempotent: true,
        });
        return {
          ok: true,
          approvalId,
          approved,
        };
      }
      this.logger.warn('approval.response persist failed', {
        companyId,
        approvalId,
        userId,
        message: e?.message,
      });
      client.emit('error', {
        code: 'APPROVAL_RESPONSE_FAILED',
        message: e?.message || 'failed to persist approval decision',
      });
      return {
        ok: false,
        code: 'APPROVAL_RESPONSE_FAILED',
        message: e?.message || 'failed to persist approval decision',
      };
    }

    client.emit('approval.response.received', {
      approvalId,
      approved,
      status: approved ? 'approved' : 'rejected',
    });

    // Real-time broadcast for UIs (room-less global updates).
    this.server.to(taskCompanyRoomName(companyId)).emit('approval.updated', {
      approvalId,
      approvalRequestId: approvalId,
      approved,
      status: approved ? 'approved' : 'rejected',
      reason: body?.reason,
    });
    return {
      ok: true,
      approvalId,
      approved,
    };
  }
}
