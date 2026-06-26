import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CollaborationProgramPhase,
  CollaborationProgramRecord,
  DeliverableBrief,
  GoalUnderstanding,
} from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class CollaborationProgramClientService {
  private readonly logger = new Logger(CollaborationProgramClientService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return Math.max(4_000, Math.min(30_000, this.config.getCollaborationMentionRpcTimeoutMs()));
  }

  async getActive(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<CollaborationProgramRecord | null> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ program?: CollaborationProgramRecord | null }>('collaboration.programs.workerMutate', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          threadId: params.threadId ?? 'main',
          sourceMessageId: '00000000-0000-0000-0000-000000000000',
          action: 'get_active',
        })
        .pipe(timeout({ first: this.rpcTimeoutMs() })),
    ).catch((err) => {
      this.logger.warn('collaboration_program.get_active_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { program: null };
    });
    return res?.program ?? null;
  }

  async createIntake(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    sourceMessageId: string;
    brief?: Partial<DeliverableBrief>;
    metadata?: Record<string, unknown> | null;
  }): Promise<CollaborationProgramRecord> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ program: CollaborationProgramRecord }>('collaboration.programs.workerMutate', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          threadId: params.threadId ?? 'main',
          sourceMessageId: params.sourceMessageId,
          action: 'create_intake',
          brief: params.brief ?? undefined,
          metadata: params.metadata ?? null,
        })
        .pipe(timeout({ first: this.rpcTimeoutMs() })),
    );
    return res.program;
  }

  async transition(params: {
    companyId: string;
    programId: string;
    toPhase: CollaborationProgramPhase;
    patch?: {
      brief?: Partial<DeliverableBrief>;
      goalUnderstanding?: GoalUnderstanding | null;
      parentGoalTaskId?: string | null;
      dispatch?: Record<string, unknown> | null;
      alignment?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    };
  }): Promise<CollaborationProgramRecord> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ program: CollaborationProgramRecord }>('collaboration.programs.workerMutate', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: '00000000-0000-0000-0000-000000000000',
          sourceMessageId: '00000000-0000-0000-0000-000000000000',
          programId: params.programId,
          phase: params.toPhase,
          action: 'transition',
          brief: params.patch?.brief,
          goalUnderstanding: params.patch?.goalUnderstanding,
          parentGoalTaskId: params.patch?.parentGoalTaskId,
          dispatch: params.patch?.dispatch,
          alignment: params.patch?.alignment,
          metadata: params.patch?.metadata,
        })
        .pipe(timeout({ first: this.rpcTimeoutMs() })),
    );
    return res.program;
  }

  async getTimeline(params: {
    companyId: string;
    programId: string;
    limit?: number;
  }): Promise<import('@contracts/types').ProgramTimelineEvent[]> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ items?: import('@contracts/types').ProgramTimelineEvent[] }>(
          'collaboration.programs.getTimeline',
          {
            companyId: params.companyId,
            actor: this.workerActor(),
            programId: params.programId,
            limit: params.limit,
          },
        )
        .pipe(timeout({ first: this.rpcTimeoutMs() })),
    ).catch((err) => {
      this.logger.warn('collaboration_program.get_timeline_failed', {
        companyId: params.companyId,
        programId: params.programId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { items: [] };
    });
    return res?.items ?? [];
  }
}
