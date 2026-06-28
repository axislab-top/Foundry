import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { BoardDecision } from '@foundry/multi-agent-core';
import { BoardGatewayService } from '@foundry/multi-agent-core';
import { ConfigService } from '../../common/config/config.service.js';

/**
 * Worker 侧 BoardGateway 实现：将治理决策写入协作房间（metadata.roomId）或结构化日志。
 */
@Injectable()
export class WorkerBoardGatewayService extends BoardGatewayService {
  private readonly logger = new Logger(WorkerBoardGatewayService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {
    super();
  }

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  override async publishDecision(decision: BoardDecision): Promise<void> {
    const companyId = String(decision.companyId ?? '').trim();
    if (!companyId) {
      this.logger.warn('board.publishDecision skipped: missing companyId');
      return;
    }
    const meta = (decision.metadata ?? {}) as Record<string, unknown>;
    const roomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
    const summary = [
      `Board ${decision.decision}`,
      decision.reason ? String(decision.reason) : '',
      `flow=${decision.approvalFlowId}`,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 2000);

    if (!roomId) {
      this.logger.log('board.decision', {
        companyId,
        boardDecisionId: decision.boardDecisionId,
        decision: decision.decision,
      });
      return;
    }

    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.appendAgent', {
            companyId,
            actor: this.actor(),
            roomId,
            agentId: this.config.getWorkerActorUserId(),
            content: summary,
            messageType: 'text',
            metadata: { kind: 'board_decision', boardDecisionId: decision.boardDecisionId, decision },
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      this.logger.warn('board.publishDecision failed', {
        companyId,
        roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
