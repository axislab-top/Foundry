import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { CeoV2ToolsService } from '../ceo/v2/tools/ceo-v2-tools.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import { REPLAY_ALLOWED_TOOL_NAMES } from './replay-delegate-canonical-tools.js';

export type ReplayCanonicalToolLoopTelemetry = {
  roundsUsed: number;
  toolCallsExecuted: number;
  toolNames: string[];
};

/**
 * Replay 相位：canonical 工具走 CeoV2Tools；skill / tool.* / mcp.* 走 AgentExecutionService（与 EffectiveCapabilityPolicy 一致）。
 */
@Injectable()
export class ReplayCanonicalToolLoopService {
  constructor(
    private readonly ceoTools: CeoV2ToolsService,
    @Inject(forwardRef(() => AgentExecutionService))
    private readonly agentExecution: AgentExecutionService,
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

  /**
   * 在已有 messages（须含首条 System + Human）上跑工具循环；追加 AIMessage/tool 往返至 messages。
   */
  async run(params: {
    modelWithTools: { invoke: (msgs: BaseMessage[]) => Promise<unknown> };
    messages: BaseMessage[];
    companyId: string;
    roomId: string;
    threadId: string | null;
    traceId: string;
    messageId: string;
    ceoAgentId: string;
    humanSenderId: string | null;
    maxRounds: number;
    maxCallsPerRound: number;
    /** LLM-visible tool names this turn (from CeoLayerOpenAiToolsService). */
    allowedToolNames: Set<string>;
    capabilitySkillIds?: string[];
  }): Promise<{ messages: BaseMessage[]; telemetry: ReplayCanonicalToolLoopTelemetry }> {
    const toolNames: string[] = [];
    let toolCallsExecuted = 0;
    let roundsUsed = 0;

    const msgs = params.messages;
    const allow =
      params.allowedToolNames.size > 0 ? params.allowedToolNames : REPLAY_ALLOWED_TOOL_NAMES;

    for (let round = 0; round < params.maxRounds; round++) {
      const response = await params.modelWithTools.invoke(msgs);
      msgs.push(response as BaseMessage);
      const toolCalls = this.extractToolCalls(response).slice(0, params.maxCallsPerRound);
      if (!toolCalls.length) {
        break;
      }

      if (!params.ceoAgentId) {
        break;
      }

      roundsUsed = round + 1;

      for (const call of toolCalls) {
        const name = String(call.name ?? '').trim();
        if (!allow.has(name)) {
          msgs.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: `TOOL_NOT_ALLOWED_IN_REPLAY:${name}` }),
            }),
          );
          continue;
        }
        toolNames.push(name);
        toolCallsExecuted += 1;
        let args = this.normalizeToolArgs(call.args);
        if (name === 'tool.message_send_to_agent') {
          args = {
            ...args,
            companyId: String(args.companyId ?? params.companyId ?? '').trim() || params.companyId,
            senderAgentId: String(args.senderAgentId ?? params.ceoAgentId ?? '').trim() || params.ceoAgentId,
            roomId: String(args.roomId ?? params.roomId ?? '').trim() || params.roomId,
            anchorMessageId:
              String(args.anchorMessageId ?? params.messageId ?? '').trim() || params.messageId,
            expectReply: args.expectReply ?? true,
          };
        }
        try {
          let content: string;
          if (REPLAY_ALLOWED_TOOL_NAMES.has(name)) {
            const results = await this.ceoTools.executeTools({
              companyId: params.companyId,
              roomId: params.roomId,
              threadId: params.threadId,
              traceId: params.traceId,
              messageId: params.messageId,
              ceoAgentId: params.ceoAgentId,
              humanSenderId: params.humanSenderId,
              toolCalls: [{ id: call.id, name, args }],
              maxCalls: 1,
            });
            content = JSON.stringify(results[0] ?? { ok: false, error: 'CANONICAL_TOOL_NO_RESULT' });
          } else {
            const exec = await this.agentExecution.executeSkill({
              companyId: params.companyId,
              agentId: params.ceoAgentId,
              projectId: undefined,
              skillName: name,
              args,
              traceId: params.traceId,
              roles: ['admin'],
              layer: 'replay',
              capabilitySkillIds: params.capabilitySkillIds,
            });
            content =
              typeof exec?.result === 'string' ? exec.result : JSON.stringify(exec?.result ?? null);
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
      telemetry: { roundsUsed, toolCallsExecuted, toolNames },
    };
  }
}
