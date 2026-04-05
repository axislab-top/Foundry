import { Inject, Logger } from '@nestjs/common';
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
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { TokenService } from '../auth/services/token.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ConfigService } from '../../common/config/config.service.js';

const RPC_TIMEOUT_MS = 15000;

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

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(API_RPC_CLIENT) private readonly api: ClientProxy,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
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
        client.disconnect(true);
        return;
      }
      const payload = await this.tokenService.verifyAccessToken(token);
      const user = await this.authService.validateUser(payload.sub);
      if (!user?.id) {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      client.data.companyId = companyIdRaw;
    } catch (e: any) {
      this.logger.warn('Collaboration WS auth failed', { message: e?.message });
      client.disconnect(true);
    }
  }

  /** 订阅全公司任务进度推送（与 Redis collab:notify 中 task:progress 事件配合） */
  @SubscribeMessage('join_company_tasks')
  async joinCompanyTasks(@ConnectedSocket() client: Socket): Promise<void> {
    const companyId = client.data.companyId as string | undefined;
    if (!companyId) {
      client.emit('error', { code: 'BAD_REQUEST', message: '缺少 companyId' });
      return;
    }
    await client.join(taskCompanyRoomName(companyId));
    client.emit('joined_tasks', { companyId });
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
      await client.join(socketRoomName(companyId, roomId));
      client.emit('joined', { roomId });
    } catch (e: any) {
      this.logger.warn('join_room RPC failed', { message: e?.message });
      client.emit('error', { code: 'RPC_ERROR', message: e?.message ?? 'join failed' });
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

  broadcastMessageNew(
    companyId: string,
    roomId: string,
    message: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(socketRoomName(companyId, roomId))
      .emit('message:new', message);
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
}
