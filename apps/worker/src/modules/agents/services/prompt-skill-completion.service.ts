import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { SkillToolSnapshot } from '@contracts/events';
import {
  buildEffectiveOpenAiTools,
  buildSkillInstructionsPayload,
  companionSkillNamesFromSnapshot,
  ToolRegistry,
} from '@service/ai';
import { CollaborationLlmBridgeService } from '../../collaboration/collaboration-llm-bridge.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import type { AgentExecutionService } from './agent-execution.service.js';
import type { ExecuteSkillParams } from './agent-execution.types.js';

const MAX_TOOL_ROUNDS = 3;

@Injectable()
export class PromptSkillCompletionService {
  private readonly logger = new Logger(PromptSkillCompletionService.name);
  private agentExecutionCached?: AgentExecutionService;

  constructor(
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly registry: ToolRegistry,
    private readonly moduleRef: ModuleRef,
    private readonly config: ConfigService,
  ) {}

  private async getAgentExecution(): Promise<AgentExecutionService> {
    if (this.agentExecutionCached) return this.agentExecutionCached;
    const { AgentExecutionService: Svc } = await import('./agent-execution.service.js');
    this.agentExecutionCached = this.moduleRef.get(Svc, { strict: false });
    return this.agentExecutionCached;
  }

  async complete(params: {
    exec: ExecuteSkillParams;
    snap: SkillToolSnapshot;
  }): Promise<unknown> {
    const { exec, snap } = params;
    const payload = buildSkillInstructionsPayload(snap, exec.args);
    const tools = await this.buildBoundToolFunctions(exec, snap);
    const userText =
      exec.args && Object.keys(exec.args).length > 0
        ? `Task context (JSON):\n${JSON.stringify(exec.args).slice(0, 12_000)}`
        : 'Execute the skill instructions and produce the deliverable.';

    const resolved = await this.llmBridge.createChatModelResolved({
      companyId: exec.companyId,
      agentId: exec.agentId,
      fallbackModelName: this.config.getCollabDirectReplyModel(),
      llmTimeoutMs: Math.min(
        (snap.timeoutSeconds ?? 60) * 1000,
        this.config.getApiRpcTimeoutMs?.() ?? 60_000,
      ),
      maxOutputTokens: snap.maxOutputTokens ?? undefined,
      trace: { callsite: 'prompt_skill_completion' },
    });

    // Sanitize tool names for API compatibility: some providers (DeepSeek) reject dots.
    const sanitizeToolName = (name: string) => name.replace(/\./g, '__');
    const toolNameMapping = new Map<string, string>(); // sanitized -> original
    const sanitizedTools = tools.map((t) => {
      const origName = (t as { function?: { name?: string } })?.function?.name ?? '';
      const sanitized = sanitizeToolName(origName);
      if (sanitized !== origName) toolNameMapping.set(sanitized, origName);
      return {
        ...t,
        function: { ...(t as { function?: Record<string, unknown> }).function, name: sanitized },
      };
    });

    const baseModel = resolved.model as unknown as {
      bindTools?: (tools: unknown[], kwargs?: Record<string, unknown>) => { invoke: (messages: unknown[]) => Promise<unknown> };
      bind?: (opts: { tools: unknown[]; tool_choice?: string }) => { invoke: (messages: unknown[]) => Promise<unknown> };
      invoke?: (messages: unknown[]) => Promise<unknown>;
    };
    let model: { invoke: (messages: unknown[]) => Promise<unknown> } = baseModel as { invoke: (messages: unknown[]) => Promise<unknown> };
    if (tools.length) {
      if (typeof baseModel.bindTools === 'function') {
        model = baseModel.bindTools(sanitizedTools, { tool_choice: 'auto' });
      } else if (typeof baseModel.bind === 'function') {
        model = baseModel.bind({ tools: sanitizedTools, tool_choice: 'auto' });
      }
    }

    const messages: BaseMessage[] = [
      new SystemMessage(payload.instructions),
      new HumanMessage(userText),
    ];

    const agentExecution = await this.getAgentExecution();
    let lastContent = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await model.invoke!(messages);
      const toolCalls = this.extractToolCalls(response);
      const text = this.extractTextContent(response);
      if (text) lastContent = text;
      if (!toolCalls.length) break;

      messages.push(response as BaseMessage);
      for (const call of toolCalls.slice(0, 5)) {
        // Map sanitized name back to original
        const rawName = String(call.name ?? '').trim();
        const originalName = toolNameMapping.get(rawName) ?? rawName;
        try {
          const toolExec = await agentExecution.executeSkill({
            ...exec,
            skillName: originalName,
            args: call.args,
          });
          const content =
            typeof toolExec.result === 'string'
              ? toolExec.result
              : JSON.stringify(toolExec.result ?? null);
          messages.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: content.slice(0, 16_000),
            }),
          );
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          messages.push(
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: err.slice(0, 1200) }),
            }),
          );
        }
      }
    }

    if (lastContent.trim()) return lastContent.trim();
    return { ok: true, kind: 'prompt_skill_complete', skillName: snap.name, payload };
  }

  private async buildBoundToolFunctions(exec: ExecuteSkillParams, snap: SkillToolSnapshot) {
    const skillName = String(snap.name ?? '').trim();
    const companionNames = companionSkillNamesFromSnapshot(snap);
    let snapshots: SkillToolSnapshot[] = [snap];
    if (companionNames.length) {
      const agentSnapshots = await this.registry.getToolSnapshotsDynamic(exec.companyId, exec.agentId);
      const companions = agentSnapshots.filter((s) => {
        const n = String(s.name ?? '').trim();
        return n && n !== skillName && companionNames.includes(n);
      });
      snapshots = [snap, ...companions];
    }
    const built = buildEffectiveOpenAiTools(this.registry, {
      snapshots,
      progressiveDisclosure: this.config.isSkillProgressiveDisclosureEnabled(),
    });
    return built.tools.filter((t) => String(t.function.name).trim() !== skillName);
  }

  private extractToolCalls(msg: unknown): Array<{ id: string; name: string; args: Record<string, unknown> }> {
    const m = msg as Record<string, unknown> | null;
    const raw =
      (m?.tool_calls as unknown[]) ??
      ((m?.additional_kwargs as Record<string, unknown> | undefined)?.tool_calls as unknown[]) ??
      [];
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((c: Record<string, unknown>) => {
        const fn = (c.function as Record<string, unknown>) ?? {};
        const id = String(c.id ?? c.tool_call_id ?? '').trim();
        const name = String(c.name ?? fn.name ?? '').trim();
        let args: Record<string, unknown> = {};
        const rawArgs = c.args ?? fn.arguments;
        if (typeof rawArgs === 'string') {
          try {
            args = JSON.parse(rawArgs) as Record<string, unknown>;
          } catch {
            args = {};
          }
        } else if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
          args = rawArgs as Record<string, unknown>;
        }
        return { id, name, args };
      })
      .filter((x) => x.id && x.name);
  }

  private extractTextContent(msg: unknown): string {
    const m = msg as { content?: unknown } | null;
    const c = m?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text ?? '');
          return '';
        })
        .join('');
    }
    return '';
  }
}
