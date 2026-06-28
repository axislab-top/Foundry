import { Injectable } from '@nestjs/common';
import type {
  MessageActionDecision,
  MessageEnvelope,
  MessageIntentCategory,
  MessageProcessingMode,
  MessageSemanticProfile,
  MessageUserFacingStage,
} from './message-processing.types.js';

@Injectable()
export class MessageProcessingPolicyService {
  readonly policyVersion = 'v2';

  buildSemanticProfile(envelope: MessageEnvelope): MessageSemanticProfile {
    const content = envelope.content.trim();
    const metadata = envelope.metadata ?? {};
    const hasMentions =
      Array.isArray(metadata.mentionedAgentIds) && metadata.mentionedAgentIds.length > 0;
    const explicitTaskIntent =
      metadata.messageCategory === 'task_publish' ||
      metadata.publishIntent === 'explicit' ||
      this.hasExplicitTaskSpec(metadata);
    const hasTaskIntent = explicitTaskIntent;
    const contentLength = content.length;
    const isNoise = contentLength === 0 || /^([.。!！?？,，\s]*)$/.test(content);

    const messageKind =
      envelope.messageType === 'stream_chunk'
        ? 'stream_chunk'
        : envelope.senderType === 'agent'
          ? 'agent_text'
          : envelope.senderType === 'human'
            ? 'human_text'
            : envelope.messageType === 'system'
              ? 'system_event'
              : 'control_message';

    const intentCategory = this.resolveIntentCategory(metadata.messageCategory, content);
    const processingMode = this.resolveProcessingMode(intentCategory, content, hasTaskIntent);
    const userFacingStage = this.resolveUserFacingStage(processingMode, messageKind, isNoise);
    const isIndexable =
      !isNoise &&
      envelope.messageType !== 'stream_chunk' &&
      envelope.senderType !== 'agent' &&
      envelope.messageType !== 'system' &&
      contentLength >= 6 &&
      !/^(ok|好的|收到|thanks|thx|yes|no)$/i.test(content);

    return {
      messageKind: isNoise ? 'noise' : messageKind,
      intentCategory,
      processingMode,
      userFacingStage,
      contentLength,
      hasMentions,
      hasTaskIntent,
      isIndexable,
      isEligibleForReceivedEvent: envelope.messageType !== 'stream_chunk',
      reasons: [
        ...(hasMentions ? ['mentions_detected'] : []),
        ...(hasTaskIntent ? ['task_intent_detected'] : []),
        ...(processingMode !== 'unknown' ? [`processing_mode:${processingMode}`] : []),
        ...(isNoise ? ['noise'] : []),
      ],
    };
  }

  decideActions(profile: MessageSemanticProfile, envelope?: Pick<MessageEnvelope, 'metadata'>): MessageActionDecision[] {
    const roomType = String(envelope?.metadata?.roomType ?? '').trim();
    const skipExtractOnMainRoom = roomType === 'main';
    return [
      {
        action: 'publish_received',
        allow: profile.isEligibleForReceivedEvent,
        reasonCodes: profile.isEligibleForReceivedEvent ? ['eligible'] : ['stream_chunk'],
      },
      {
        action: 'extract_task_candidates',
        allow:
          profile.hasTaskIntent &&
          profile.messageKind === 'human_text' &&
          !skipExtractOnMainRoom,
        reasonCodes: skipExtractOnMainRoom
          ? ['main_room_dispatch_plan_v2']
          : profile.hasTaskIntent
            ? ['task_intent']
            : ['no_task_intent'],
      },
      {
        action: 'route_mentions',
        allow: profile.hasMentions,
        reasonCodes: profile.hasMentions ? ['mentions_detected'] : ['no_mentions'],
      },
      {
        action: 'request_memory_index',
        allow: profile.isIndexable,
        reasonCodes: profile.isIndexable ? ['indexable'] : ['not_indexable'],
      },
    ];
  }

  private resolveProcessingMode(
    intentCategory: MessageIntentCategory,
    content: string,
    hasTaskIntent: boolean,
  ): MessageProcessingMode {
    if (intentCategory === 'task_publish' || hasTaskIntent) return 'task_execution';
    if (intentCategory === 'coordination' || intentCategory === 'upgrade_request') return 'coordination';
    if (intentCategory === 'approval') return 'approval';
    if (intentCategory === 'report') return 'report';
    if (/讨论一下|一起讨论|评审|复盘|头脑风暴|brainstorm|review/i.test(content)) return 'discussion';
    if (/之前.*怎么|上次.*结论|记得|记忆|历史|查一下.*记录/i.test(content)) return 'memory_lookup';
    if (intentCategory === 'decision' || intentCategory === 'execution_detail') return 'conversation';
    return 'unknown';
  }

  private resolveUserFacingStage(
    processingMode: MessageProcessingMode,
    messageKind: MessageSemanticProfile['messageKind'],
    isNoise: boolean,
  ): MessageUserFacingStage {
    if (isNoise || messageKind === 'stream_chunk') return 'received';
    if (processingMode === 'task_execution') return 'task_candidate_detected';
    if (processingMode === 'coordination') return 'coordination_candidate_detected';
    if (processingMode === 'approval') return 'approval_candidate_detected';
    if (processingMode === 'report') return 'report_detected';
    if (processingMode === 'memory_lookup') return 'memory_lookup_detected';
    if (processingMode === 'discussion') return 'discussion_only';
    if (processingMode === 'conversation') return 'conversation_only';
    return 'understanding';
  }

  private resolveIntentCategory(raw: unknown, content: string): MessageIntentCategory {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (
        trimmed === 'task_publish' ||
        trimmed === 'report' ||
        trimmed === 'approval' ||
        trimmed === 'coordination' ||
        trimmed === 'upgrade_request' ||
        trimmed === 'execution_detail' ||
        trimmed === 'decision'
      ) {
        return trimmed;
      }
    }

    const lower = content.toLowerCase();
    if (/升级|需要ceo决策|跨部门|升级请求|决策请求/i.test(content)) return 'upgrade_request';
    if (/执行|实现|步骤|排期|代码|细节|日志|报错|联调/.test(lower)) return 'execution_detail';
    if (/汇报|进度|已完成|完成了|结果|反馈|同步/.test(lower)) return 'report';
    if (/审批|批准|确认|同意/.test(lower)) return 'approval';
    if (/协调|协作|支援|配合/.test(lower)) return 'coordination';
    return 'unknown';
  }

  private hasExplicitTaskSpec(metadata: Record<string, unknown>): boolean {
    const raw = metadata.taskSpecDraft ?? metadata.taskSpec;
    return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw));
  }
}
