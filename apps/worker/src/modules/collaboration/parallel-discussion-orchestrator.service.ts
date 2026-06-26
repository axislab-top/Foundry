import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '../../common/config/config.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { ParallelAgentDiscussionGraph } from './subgraphs/parallel-agent-discussion.graph.js';

@Injectable()
export class ParallelDiscussionOrchestrator {
  private readonly logger = new Logger(ParallelDiscussionOrchestrator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly parallelAgentDiscussionGraph: ParallelAgentDiscussionGraph,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc
        .send<T>(pattern, payload)
        .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }

  async run(input: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    sourceThreadId?: string;
    contentText: string;
    agentIds: string[];
    minAgents: number;
    maxAgents: number;
    /** 人类触发者，透传至各 Agent 子图直聊（门控见 GroupChatContextService） */
    humanSenderId?: string | null;
  }): Promise<{
    discussionId: string;
    subRoomId: string;
    failedAgentIds: string[];
    completedAgentIds: string[];
    status: 'completed' | 'partial_failed';
  }> {
    const started = Date.now();
    const discussionId = randomUUID();
    const capped = Array.from(new Set(input.agentIds)).slice(0, input.maxAgents);
    if (capped.length < input.minAgents) {
      return {
        discussionId,
        subRoomId: input.sourceThreadId ?? '',
        failedAgentIds: [],
        completedAgentIds: [],
        status: 'partial_failed',
      };
    }

    const thread = await this.rpcWithRetry<{ id: string }>('collaboration.threads.create', {
      companyId: input.companyId,
      actor: this.workerActor(),
      roomId: input.roomId,
      title: `并行讨论-${discussionId.slice(0, 8)}`,
      collaborationMode: 'discussion',
    });
    const subRoomId = thread.id;

    await this.rpcWithRetry('collaboration.members.add', {
      companyId: input.companyId,
      actor: this.workerActor(),
      roomId: input.roomId,
      members: capped.map((agentId) => ({ memberType: 'agent', memberId: agentId })),
    });

    await this.rpcWithRetry('collaboration.threads.mergeMetadata', {
      companyId: input.companyId,
      actor: this.workerActor(),
      threadId: subRoomId,
      metadata: {
        parallelDiscussion: {
          discussionId,
          sourceMessageId: input.sourceMessageId,
          createdBy: 'parallel_orchestrator',
        },
      },
    });

    const tasks = capped.map(async (agentId) => {
      const result = await this.parallelAgentDiscussionGraph.runForAgent({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: subRoomId,
        sourceMessageId: input.sourceMessageId,
        userMessage: input.contentText,
        agentId,
        humanUserId: input.humanSenderId ?? undefined,
      });
      return result;
    });
    const all = await Promise.all(tasks);
    const failedAgentIds = all.filter((x) => !x.ok).map((x) => x.agentId);
    const completedAgentIds = all.filter((x) => x.ok).map((x) => x.agentId);
    const status = failedAgentIds.length > 0 ? 'partial_failed' : 'completed';

    this.monitoring.incParallelDiscussionTotal(status);
    this.monitoring.observeParallelAgentCount(capped.length);
    this.monitoring.observeDiscussionMergeLatencySeconds((Date.now() - started) / 1000);
    this.logger.log('parallel discussion finished', {
      discussionId,
      subRoomId,
      status,
      completedCount: completedAgentIds.length,
      failedCount: failedAgentIds.length,
    });

    return { discussionId, subRoomId, failedAgentIds, completedAgentIds, status };
  }
}
