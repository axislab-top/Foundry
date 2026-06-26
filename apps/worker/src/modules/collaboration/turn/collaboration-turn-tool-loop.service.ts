import { Injectable } from '@nestjs/common';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { CeoV2ToolsService } from '../ceo/v2/tools/ceo-v2-tools.service.js';
import { CollaborationOrchestrateToolHandler } from './collaboration-orchestrate-tool.handler.js';
import {
  COLLABORATION_CANONICAL_TOOL_NAMES,
  COLLABORATION_TURN_ALLOWED_TOOL_NAMES,
} from './collaboration-turn-tools.js';
import type { CollaborationTurnToolContext } from './collaboration-turn-tool.types.js';

export type CollaborationTurnToolLoopTelemetry = {
  roundsUsed: number;
  toolCallsExecuted: number;
  toolNames: string[];
  orchestrationRan: boolean;
};

@Injectable()
export class CollaborationTurnToolLoopService {
  constructor(
    private readonly ceoTools: CeoV2ToolsService,
    private readonly orchestrateHandler: CollaborationOrchestrateToolHandler,
  ) {}

  extractToolCalls(msg: unknown): Array<{ id: string; name: string; args: unknown }> {
    const raw =
      (msg as { tool_calls?: unknown; toolCalls?: unknown })?.tool_calls ??
      (msg as { toolCalls?: unknown })?.toolCalls ??
      (msg as { additional_kwargs?: { tool_calls?: unknown } })?.additional_kwargs?.tool_calls ??
      [];
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((c: Record<string, unknown>) => {
        const id = String(c?.id ?? c?.tool_call_id ?? '').trim();
        const name = String(c?.name ?? (c?.function as { name?: string } | undefined)?.name ?? '').trim();
        const fn = c?.function as { arguments?: unknown } | undefined;
        const args = c?.args ?? fn?.arguments ?? c?.arguments;
        return id && name ? { id, name, args } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; args: unknown }>;
  }

  private normalizeToolArgs(args: unknown): Record<string, unknown> {
    if (args && typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>;
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
    return {};
  }

  async run(params: {
    modelWithTools: { invoke: (msgs: BaseMessage[]) => Promise<unknown> };
    messages: BaseMessage[];
    turnContext: CollaborationTurnToolContext;
    maxRounds: number;
    maxCallsPerRound: number;
    allowedToolNames?: Set<string>;
  }): Promise<{ messages: BaseMessage[]; telemetry: CollaborationTurnToolLoopTelemetry }> {
    const toolNames: string[] = [];
    let toolCallsExecuted = 0;
    let roundsUsed = 0;
    let orchestrationRan = false;

    const msgs = params.messages;
    const allow =
      params.allowedToolNames && params.allowedToolNames.size > 0
        ? params.allowedToolNames
        : COLLABORATION_TURN_ALLOWED_TOOL_NAMES;

    for (let round = 0; round < params.maxRounds; round++) {
      const response = await params.modelWithTools.invoke(msgs);
      msgs.push(response as BaseMessage);
      const toolCalls = this.extractToolCalls(response).slice(0, params.maxCallsPerRound);
      if (!toolCalls.length) {
        break;
      }

      roundsUsed = round + 1;

      for (const call of toolCalls) {
        const name = String(call.name ?? '').trim();
        if (!allow.has(name)) {
          msgs.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: `TOOL_NOT_ALLOWED_IN_TURN:${name}` }),
            }),
          );
          continue;
        }
        toolNames.push(name);
        toolCallsExecuted += 1;
        const args = this.normalizeToolArgs(call.args);
        try {
          let content: string;
          if (name === 'collaboration.program.get_active') {
            const program = await this.orchestrateHandler.getActiveProgram(params.turnContext);
            content = JSON.stringify({ ok: true, program });
          } else if (name === 'collaboration.orchestrate') {
            const result = await this.orchestrateHandler.orchestrate(params.turnContext, args);
            if (result.ok === true) {
              orchestrationRan = true;
            }
            content = JSON.stringify(result);
          } else if (COLLABORATION_CANONICAL_TOOL_NAMES.has(name)) {
            const results = await this.ceoTools.executeTools({
              companyId: params.turnContext.companyId,
              roomId: params.turnContext.roomId,
              threadId: params.turnContext.threadId,
              traceId: params.turnContext.traceId,
              messageId: params.turnContext.messageId,
              ceoAgentId: params.turnContext.ceoAgentId,
              humanSenderId: params.turnContext.humanSenderId,
              toolCalls: [{ id: call.id, name, args }],
              maxCalls: 1,
            });
            content = JSON.stringify(results[0] ?? { ok: false, error: 'CANONICAL_TOOL_NO_RESULT' });
          } else {
            content = JSON.stringify({ ok: false, error: `TOOL_NOT_HANDLED:${name}` });
          }
          msgs.push(new ToolMessage({ tool_call_id: call.id, content: content.slice(0, 16_000) }));
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          msgs.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: err.slice(0, 1200) }),
            }),
          );
        }
      }
    }

    return {
      messages: msgs,
      telemetry: { roundsUsed, toolCallsExecuted, toolNames, orchestrationRan },
    };
  }
}
