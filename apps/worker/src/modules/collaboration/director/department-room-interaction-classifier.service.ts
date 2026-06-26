import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import {
  departmentRoomInteractionLlmSchema,
  type DepartmentRoomInteractionLlmParsed,
  type DepartmentRoomInteractionMode,
} from '../contracts/collaboration-2026.contracts.js';
import {
  DEPARTMENT_ROOM_INTERACTION_CLASSIFIER_SYSTEM,
  DEPARTMENT_ROOM_INTERACTION_JSON_REPAIR_INSTRUCTION,
} from './department-room-interaction.prompt.js';
import {
  buildDepartmentRoomRoster,
  rosterAllowsExecutor,
  type DepartmentRoomAgentRosterEntry,
} from './department-room-structural-route.util.js';

export type DepartmentRoomInteractionClassification = {
  interactionMode: DepartmentRoomInteractionMode;
  targetAgentIds: string[];
  confidence: number;
  explanation: string;
  delegationOutline: Array<{ title: string; suggestedExecutorAgentId?: string }>;
  llmUsed: boolean;
  classifierFallback: boolean;
};

@Injectable()
export class DepartmentRoomInteractionClassifierService {
  private readonly logger = new Logger(DepartmentRoomInteractionClassifierService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
  ) {}

  async classify(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    contentText: string;
    roomContext: RoomContext;
    mentionedAgentIds?: string[];
    messageCategory?: string | null;
    directorAgentId: string;
  }): Promise<DepartmentRoomInteractionClassification> {
    const roster = buildDepartmentRoomRoster(params.roomContext);
    const allowedIds = new Set(roster.map((r) => r.agentId));

    const structuralCategory = String(params.messageCategory ?? '').trim();
    if (structuralCategory === 'task_publish') {
      const llm = await this.runClassifierLlm(params, roster);
      const merged = this.normalizeClassification(llm, {
        directorAgentId: params.directorAgentId,
        allowedIds,
        roster,
        preferMode: 'delegate_tasks',
      });
      return { ...merged, llmUsed: !llm.classifierFallback, classifierFallback: llm.classifierFallback };
    }

    const llm = await this.runClassifierLlm(params, roster);
    const merged = this.normalizeClassification(llm, {
      directorAgentId: params.directorAgentId,
      allowedIds,
      roster,
    });
    return { ...merged, llmUsed: !llm.classifierFallback, classifierFallback: llm.classifierFallback };
  }

  private normalizeClassification(
    parsed: DepartmentRoomInteractionLlmParsed & { classifierFallback: boolean },
    ctx: {
      directorAgentId: string;
      allowedIds: Set<string>;
      roster: DepartmentRoomAgentRosterEntry[];
      preferMode?: DepartmentRoomInteractionMode;
    },
  ): Omit<DepartmentRoomInteractionClassification, 'llmUsed' | 'classifierFallback'> {
    const mode = ctx.preferMode ?? parsed.interactionMode;
    const rawTargets = (parsed.targetAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter((id) => ctx.allowedIds.has(id))
      .slice(0, 8);

    const outline = (parsed.delegationOutline ?? [])
      .map((row) => ({
        title: String(row.title ?? '').trim().slice(0, 240),
        suggestedExecutorAgentId: row.suggestedExecutorAgentId
          ? String(row.suggestedExecutorAgentId).trim()
          : undefined,
      }))
      .filter((row) => row.title.length > 0)
      .slice(0, 6)
      .map((row) => ({
        ...row,
        suggestedExecutorAgentId:
          row.suggestedExecutorAgentId &&
          rosterAllowsExecutor(ctx.roster, row.suggestedExecutorAgentId, ctx.directorAgentId)
            ? row.suggestedExecutorAgentId
            : undefined,
      }));

    let targetAgentIds = rawTargets;
    if (mode === 'employee_direct' && targetAgentIds.length === 0) {
      targetAgentIds = ctx.roster
        .filter((r) => r.agentId !== ctx.directorAgentId)
        .map((r) => r.agentId)
        .slice(0, 1);
    }
    if (mode === 'conversation' || mode === 'delegate_tasks') {
      if (!targetAgentIds.includes(ctx.directorAgentId)) {
        targetAgentIds = [ctx.directorAgentId, ...targetAgentIds.filter((id) => id !== ctx.directorAgentId)].slice(
          0,
          8,
        );
      }
    }

    return {
      interactionMode: mode,
      targetAgentIds,
      confidence: Number(parsed.confidence ?? 0.5),
      explanation: String(parsed.explanation ?? '').slice(0, 400),
      delegationOutline: mode === 'delegate_tasks' ? outline : [],
    };
  }

  private async runClassifierLlm(
    params: {
      companyId: string;
      roomId: string;
      messageId: string;
      contentText: string;
      mentionedAgentIds?: string[];
      messageCategory?: string | null;
      directorAgentId: string;
    },
    roster: DepartmentRoomAgentRosterEntry[],
  ): Promise<DepartmentRoomInteractionLlmParsed & { classifierFallback: boolean }> {
    const ctx = { companyId: params.companyId, messageId: params.messageId };
    try {
      const resolved = await this.llmBridge.createChatModelResolved({
        companyId: params.companyId,
        agentId: params.directorAgentId,
        fallbackModelName: this.config.getCollabDirectReplyModel(),
        llmTimeoutMs: Math.min(this.config.getCollaborationLlmTimeoutMs(), 45_000),
        trace: { messageId: params.messageId, callsite: 'department_room_interaction_classifier' },
      });
      const model = resolved.model as BaseChatModel & { invoke: (input: unknown) => Promise<AIMessage> };
      const userPayload = {
        messageCategory: params.messageCategory ?? null,
        mentionedAgentIds: params.mentionedAgentIds ?? [],
        directorAgentId: params.directorAgentId,
        userMessage: String(params.contentText ?? '').slice(0, 4000),
        roster: roster.map((r) => ({
          agentId: r.agentId,
          role: r.role,
          displayName: r.displayName ?? null,
        })),
      };
      const baseMessages = [
        new SystemMessage(DEPARTMENT_ROOM_INTERACTION_CLASSIFIER_SYSTEM),
        new HumanMessage(JSON.stringify(userPayload)),
      ];
      const t1 = this.messageText(await model.invoke(baseMessages));
      const primary = this.tryParseModelText('primary', ctx, t1);
      if (primary) return { ...primary, classifierFallback: false };

      const repairMessagesFixed = [
        ...baseMessages,
        new HumanMessage(
          JSON.stringify({
            instruction: DEPARTMENT_ROOM_INTERACTION_JSON_REPAIR_INSTRUCTION,
            prior_output: t1.slice(0, 14_000),
          }),
        ),
      ];
      const t2 = this.messageText(await model.invoke(repairMessagesFixed));
      const second = this.tryParseModelText('repair', ctx, t2);
      if (second) return { ...second, classifierFallback: false };
    } catch (e: unknown) {
      this.logger.warn('department_room_interaction_classifier.llm_failed', {
        companyId: params.companyId,
        messageId: params.messageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    return {
      interactionMode: 'conversation',
      targetAgentIds: [params.directorAgentId],
      confidence: 0.5,
      explanation: 'department_interaction_classifier_fallback',
      delegationOutline: undefined,
      classifierFallback: true,
    };
  }

  private tryParseModelText(
    label: string,
    ctx: { companyId: string; messageId: string },
    rawText: string,
  ): DepartmentRoomInteractionLlmParsed | null {
    try {
      const obj = this.parseJsonObjectFromModelText(rawText);
      const parsed = departmentRoomInteractionLlmSchema.parse(obj);
      this.logger.log(`department_room_interaction_classifier.${label}_parsed`, {
        companyId: ctx.companyId,
        messageId: ctx.messageId,
        interactionMode: parsed.interactionMode,
        confidence: parsed.confidence,
      });
      return parsed;
    } catch (e: unknown) {
      this.logger.warn(`department_room_interaction_classifier.${label}_invalid`, {
        companyId: ctx.companyId,
        messageId: ctx.messageId,
        err: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private messageText(msg: AIMessage): string {
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((p) =>
          typeof p === 'object' && p !== null && 'text' in p
            ? String((p as { text?: string }).text ?? '')
            : String(p),
        )
        .join('');
    }
    return String(c ?? '');
  }

  private parseJsonObjectFromModelText(raw: string): unknown {
    const t = raw.trim();
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
    const body = fence ? fence[1]!.trim() : t;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('department_interaction_json_not_found');
    }
    return JSON.parse(body.slice(start, end + 1));
  }
}
