import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';

export type AgentDirectSkillToolLoopTelemetry = {
  roundsUsed: number;
  toolCallsExecuted: number;
  toolNames: string[];
};

@Injectable()
export class AgentDirectSkillToolLoopService {
  constructor(
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

  normalizeToolArgs(args: unknown): Record<string, unknown> {
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

  extractTextContent(msg: unknown): string {
    const m = msg as { content?: unknown } | null;
    const c = m?.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text ?? '');
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  /**
   * 直聊单阶段 tool loop：仅 executeSkill（layer=direct），无 CEO canonical tools。
   */
  async run(params: {
    modelWithTools: { invoke: (msgs: BaseMessage[]) => Promise<unknown> };
    modelPlain?: { invoke: (msgs: BaseMessage[]) => Promise<unknown> };
    messages: BaseMessage[];
    companyId: string;
    agentId: string;
    traceId: string;
    maxRounds: number;
    maxCallsPerRound: number;
    allowedToolNames: Set<string>;
    capabilitySkillIds?: string[];
    promptSkillMode?: 'auto' | 'complete';
  }): Promise<{ messages: BaseMessage[]; telemetry: AgentDirectSkillToolLoopTelemetry; text: string }> {
    const toolNames: string[] = [];
    let toolCallsExecuted = 0;
    let roundsUsed = 0;
    let lastText = '';

    const msgs = params.messages;
    const allow = params.allowedToolNames;

    for (let round = 0; round < params.maxRounds; round++) {
      const response = await params.modelWithTools.invoke(msgs);
      msgs.push(response as BaseMessage);
      const text = this.extractTextContent(response);
      if (text) lastText = text;

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
              content: JSON.stringify({ ok: false, error: `TOOL_NOT_ALLOWED_IN_DIRECT:${name}` }),
            }),
          );
          continue;
        }
        toolNames.push(name);
        toolCallsExecuted += 1;
        const args = this.normalizeToolArgs(call.args);
        try {
          const exec = await this.agentExecution.executeSkill({
            companyId: params.companyId,
            agentId: params.agentId,
            projectId: undefined,
            skillName: name,
            args,
            traceId: params.traceId,
            roles: ['admin'],
            layer: 'direct',
            capabilitySkillIds: params.capabilitySkillIds,
            promptSkillMode: params.promptSkillMode ?? 'auto',
          });
          const content = this.formatToolResultContent(exec?.result);
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

    if (!lastText.trim() && params.modelPlain && toolCallsExecuted > 0) {
      const finalResponse = await params.modelPlain.invoke(msgs);
      msgs.push(finalResponse as BaseMessage);
      lastText = this.extractTextContent(finalResponse);
    }

    return {
      messages: msgs,
      telemetry: { roundsUsed, toolCallsExecuted, toolNames },
      text: lastText,
    };
  }

  /** skill_instructions payload 给模型可读摘要，其余 JSON 截断传递。 */
  private formatToolResultContent(result: unknown): string {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const r = result as Record<string, unknown>;
      if (r.kind === 'skill_instructions' && typeof r.instructions === 'string') {
        const hint = typeof r.hint === 'string' ? `\n\n${r.hint}` : '';
        return String(r.instructions) + hint;
      }
    }
    try {
      return JSON.stringify(result ?? null);
    } catch {
      return String(result ?? '');
    }
  }
}
