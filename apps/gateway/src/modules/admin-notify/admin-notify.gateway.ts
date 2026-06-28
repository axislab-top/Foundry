import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/services/token.service.js';
import { AuthService } from '../auth/auth.service.js';
import { WsTenantGuard } from '../../common/guards/ws-tenant.guard.js';

const roomName = (companyId: string) => `admin:alerts:${companyId}`;

function extractBearer(authHeader: string | undefined): string | undefined {
  if (!authHeader || typeof authHeader !== 'string') return undefined;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

@WebSocketGateway({
  namespace: '/admin-notify',
  cors: { origin: true, credentials: true },
})
@Injectable()
export class AdminNotifyGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AdminNotifyGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly wsTenantGuard: WsTenantGuard,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawAuth = client.handshake.auth as Record<string, unknown> | undefined;
      const token =
        (typeof rawAuth?.token === 'string' && rawAuth.token) ||
        extractBearer(client.handshake.headers?.authorization as string | undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.tokenService.verifyAccessToken(token);
      const user = await this.authService.validateUser(payload.sub);
      if (!user?.id) {
        client.disconnect(true);
        return;
      }

      const roles = user.roles ?? [];
      if (!roles.includes('admin') && !roles.includes('superadmin')) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      client.data.roles = roles;
    } catch (e: any) {
      this.logger.warn('admin-notify WS auth failed', { message: e?.message });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('alerts:subscribe')
  async subscribeAlerts(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { companyIds?: string[] },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const companyIds = (body?.companyIds ?? [])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (!userId) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'not authenticated' });
      return;
    }

    if (!companyIds.length) {
      client.emit('alerts:subscribed', { companyIds: [] });
      return;
    }

    try {
      for (const companyId of companyIds) {
        await this.wsTenantGuard.assertMembershipOrThrow({
          userId,
          companyId,
          event: 'alerts:subscribe',
          socketId: client.id,
        });
      }
    } catch {
      client.emit('error', { code: 'FORBIDDEN', message: 'forbidden tenant access' });
      return;
    }
    await Promise.all(companyIds.map((cid) => client.join(roomName(cid))));
    client.emit('alerts:subscribed', { companyIds });
  }

  emitAlertNew(companyId: string, alertPayload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(roomName(companyId)).emit('alerts:new', alertPayload);
  }

  emitAlertResolved(companyId: string, alertPayload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(roomName(companyId)).emit('alerts:resolved', alertPayload);
  }
}

