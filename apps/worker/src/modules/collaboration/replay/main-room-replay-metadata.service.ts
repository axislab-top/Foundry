import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { CeoAlignmentMetadata, CeoPipelineProgressMetadata } from '@foundry/contracts/types/ceo-alignment';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 主群 Replay：trigger message metadata 回写（对齐状态 / 管线进度）。
 */
@Injectable()
export class MainRoomReplayMetadataService {
  private readonly logger = new Logger(MainRoomReplayMetadataService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private rpcTimeoutMs(): number {
    return Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
  }

  async patchTriggerMetadata(params: {
    companyId: string;
    messageId: string;
    patch: Record<string, unknown>;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const messageId = String(params.messageId ?? '').trim();
    if (!companyId || !messageId || !params.patch || Object.keys(params.patch).length === 0) return;
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.patchMetadata', {
            companyId,
            messageId,
            actor: { id: this.config.getWorkerActorUserId(), roles: ['admin'] },
            metadata: params.patch,
          })
          .pipe(timeout({ first: this.rpcTimeoutMs() })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.replay_metadata.patch_failed', {
        companyId,
        messageId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async patchTriggerAlignment(params: {
    companyId: string;
    messageId: string;
    alignment: CeoAlignmentMetadata;
  }): Promise<void> {
    await this.patchTriggerMetadata({
      companyId: params.companyId,
      messageId: params.messageId,
      patch: { ceoAlignment: params.alignment },
    });
  }

  async patchTriggerPipelineProgress(params: {
    companyId: string;
    messageId: string;
    progress: CeoPipelineProgressMetadata;
  }): Promise<void> {
    await this.patchTriggerMetadata({
      companyId: params.companyId,
      messageId: params.messageId,
      patch: { ceoPipelineProgress: params.progress },
    });
  }
}
