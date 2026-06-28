import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseOrchestrator,
  LayeredLangGraphOrchestrator,
  RuntimeExecutionContext,
  type AgentMessage,
  type AgentMessageDispatcher,
  type SupervisionResult,
  type TaskDelegationRequest,
} from '@foundry/multi-agent-core';
import { MessagingService } from '@service/messaging';
import { ConfigService } from '../../common/config/config.service.js';

export interface CeoRuntimeOrchestrateInput {
  companyId: string;
  goal: string;
  currentAgentId: string;
  traceId?: string;
  inputs?: Record<string, unknown>;
  delegations?: TaskDelegationRequest[];
  roomId?: string;
  messageId?: string;
}

@Injectable()
export class CeoRuntimeOrchestratorService extends BaseOrchestrator {
  private pendingDelegations: TaskDelegationRequest[] = [];
  private readonly layered: LayeredLangGraphOrchestrator;

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {
    super(
      new RuntimeExecutionContext({
        companyId: 'runtime-bootstrap',
        currentAgentId: 'ceo-runtime-bootstrap',
      }),
      { enableSupervision: true },
    );
    const dispatcher: AgentMessageDispatcher = {
      dispatch: async (message, _context) => {
        await this.messaging.publish(message as any, {
          routingKey: 'collaboration.agent-message.received',
          persistent: true,
        });
      },
    };
    this.layered = new LayeredLangGraphOrchestrator(dispatcher);
  }

  public async orchestrateGoal(input: CeoRuntimeOrchestrateInput) {
    this.pendingDelegations = input.delegations ?? [];
    const runtimeContext = new RuntimeExecutionContext({
      traceId: input.traceId,
      companyId: input.companyId,
      currentAgentId: input.currentAgentId,
    });
    this.setContext(runtimeContext);

    if (this.config.isLayeredGraphEnabled() && this.config.isAcpProtocolEnabled()) {
      const layeredResult = await this.layered.run(input.goal, runtimeContext);
      return {
        success: layeredResult.next === 'end',
        data: layeredResult.payload,
        traceEvents: runtimeContext.getTraceEvents(),
      };
    }
    return this.orchestrate(input.goal, input.inputs);
  }

  protected async breakdown(_goal: string): Promise<TaskDelegationRequest[]> {
    return this.pendingDelegations;
  }

  protected async supervise(goal: string, inputs?: unknown): Promise<SupervisionResult> {
    void inputs;
    if (goal.trim().length === 0) {
      return { action: 'block', reason: 'goal is empty' };
    }
    return { action: 'allow', reason: 'default runtime supervisor allow' };
  }

  protected async dispatchMessage(message: AgentMessage): Promise<void> {
    if (!this.config.isAcpProtocolEnabled()) {
      this.context.emitTrace({
        type: 'orchestrator.dispatch.disabled',
        reason: 'ENABLE_ACP_PROTOCOL=0',
      });
      return;
    }
    await this.messaging.publish(message as any, {
      routingKey: 'collaboration.agent-message.received',
      persistent: true,
    });
  }
}
