import type { ClientProxy } from '@nestjs/microservices';
import type { Logger } from '@nestjs/common';
import type { OrchestrationRunLifecycle, OrchestrationTerminalKind } from '@foundry/contracts/types/orchestration-lifecycle';
import { firstValueFrom, timeout } from 'rxjs';
import { buildOrchestrationLifecyclePatch } from './pipeline-v2/map-main-room-orchestration-terminal.util.js';
import { serializeUnknownErrorForLog } from '../../common/logging/serialize-unknown-error.js';

/** Worker 侧 best-effort 写入主群 orchestration run lifecycle（Dispatch Plan v2 闭环 SSOT）。 */
export function upsertMainRoomOrchestrationLifecycleBestEffort(params: {
  apiRpc: ClientProxy;
  logger: Logger;
  workerActorUserId: string;
  rpcTimeoutMs: number;
  companyId: string;
  roomId: string;
  sourceMessageId: string;
  lifecycle: OrchestrationRunLifecycle;
  terminalKind?: OrchestrationTerminalKind;
  stage?: string;
  metadataPatch?: Record<string, unknown>;
  workerRunId?: string;
  programId?: string | null;
  logContext?: string;
}): void {
  const sourceMessageId = String(params.sourceMessageId ?? '').trim();
  const roomId = String(params.roomId ?? '').trim();
  const companyId = String(params.companyId ?? '').trim();
  if (!companyId || !roomId || !sourceMessageId) return;

  const patch = buildOrchestrationLifecyclePatch({
    lifecycle: params.lifecycle,
    terminalKind: params.terminalKind,
    stage: params.stage,
    metadataPatch: params.metadataPatch,
  });

  const ms = Math.max(4_000, Math.min(60_000, params.rpcTimeoutMs));
  void firstValueFrom(
    params.apiRpc
      .send('collaboration.orchestrationRuns.workerUpsert', {
        companyId,
        actor: { id: params.workerActorUserId, roles: ['admin'] as string[] },
        roomId,
        sourceMessageId,
        workerRunId: params.workerRunId,
        programId: params.programId ?? undefined,
        status: patch.status,
        stage: patch.stage,
        metadata: patch.metadata,
      })
      .pipe(timeout({ first: ms })),
  ).catch((e: unknown) => {
    params.logger.warn('main_room.orchestration_lifecycle.upsert_failed', {
      companyId,
      roomId,
      sourceMessageId,
      lifecycle: params.lifecycle,
      context: params.logContext ?? 'unknown',
      ...serializeUnknownErrorForLog(e),
    });
  });
}
