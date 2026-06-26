import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

export type CollaborationRoomMode = 'discussion' | 'direct' | 'execution' | 'approval_wait';

/**
 * 服务端 SSOT：CEO 授权/确认执行后同步房间 collaborationMode（Chat-first，前端只读）。
 */
@Injectable()
export class CollaborationRoomModeSyncService {
  private readonly logger = new Logger(CollaborationRoomModeSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async syncToExecutionIfEnabled(params: {
    companyId: string;
    roomId: string;
    changeReason: string;
  }): Promise<void> {
    if (!this.config.isCeoDecisionSyncRoomModeEnabled()) return;
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    try {
      const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
      await firstValueFrom(
        this.apiRpc
          .send<unknown>('collaboration.rooms.updateCollaborationMode', {
            companyId,
            actor: this.workerActor(),
            roomId,
            collaborationMode: 'execution' satisfies CollaborationRoomMode,
            changeReason: params.changeReason.slice(0, 200),
          })
          .pipe(timeout(timeoutMs)),
      );
    } catch (err: unknown) {
      this.logger.warn('collaboration.room_mode_sync_failed', {
        companyId,
        roomId,
        targetMode: 'execution',
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
