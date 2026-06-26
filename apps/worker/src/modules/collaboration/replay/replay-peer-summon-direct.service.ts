import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import { CeoSequentialPeerIntroSessionService } from './ceo-sequential-peer-intro-session.service.js';

export type ReplayPeerSummonDirectResult = {
  ok: boolean;
  summonAccepted?: boolean;
  error?: string;
};

/**
 * 主群 peer summon：服务端直连 internal tool（不经 LLM tool loop）。
 * 用于依次自我介绍等已解析 targetAgentId 的场景；DeepSeek 等模型可能忽略 tool_choice: required。
 */
@Injectable()
export class ReplayPeerSummonDirectService {
  private readonly logger = new Logger(ReplayPeerSummonDirectService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => AgentExecutionService))
    private readonly agentExecution: AgentExecutionService,
    private readonly sequentialPeerIntroSession: CeoSequentialPeerIntroSessionService,
  ) {}

  async summonDirectorInMainRoom(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    threadId?: string | null;
    ceoAgentId: string;
    humanSenderId?: string | null;
    targetAgentId: string;
    targetDisplayName: string;
    content?: string | null;
    capabilitySkillIds?: string[];
  }): Promise<ReplayPeerSummonDirectResult> {
    if (!this.config.isCollabAgentPeerSummonEnabled()) {
      return { ok: false, error: 'peer_summon_disabled' };
    }
    const ceoId = String(params.ceoAgentId ?? '').trim();
    const targetId = String(params.targetAgentId ?? '').trim();
    if (!ceoId || !targetId) {
      return { ok: false, error: 'missing_agent_id' };
    }

    const displayName = String(params.targetDisplayName ?? '').trim() || '同事';
    const content =
      String(params.content ?? '').trim() ||
      `@${displayName} 请在群内做个简要自我介绍，说明您负责的领域与近期工作重点。`;

    try {
      const exec = await this.agentExecution.executeSkill({
        companyId: params.companyId,
        agentId: ceoId,
        projectId: undefined,
        skillName: 'tool.message_send_to_agent',
        args: {
          companyId: params.companyId,
          senderAgentId: ceoId,
          targetAgentId: targetId,
          roomId: params.roomId,
          content,
          expectReply: true,
          anchorMessageId: params.messageId,
          ...(params.threadId ? { threadId: params.threadId } : {}),
        },
        traceId: params.traceId,
        roles: ['admin'],
        layer: 'replay',
        capabilitySkillIds: params.capabilitySkillIds,
      });

      const raw = exec?.result;
      let summonAccepted = true;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const rec = raw as Record<string, unknown>;
        if (rec.summonAccepted === false) summonAccepted = false;
        if (rec.ok === false) {
          return {
            ok: false,
            error: String(rec.error ?? rec.message ?? 'peer_summon_rejected').slice(0, 500),
          };
        }
      }

      await this.sequentialPeerIntroSession.activateSession(params.companyId, params.roomId);

      this.logger.log('ceo.sequential_peer_intro.direct_summon_ok', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        traceId: params.traceId,
        targetAgentId: targetId,
        summonAccepted,
      });

      return { ok: true, summonAccepted };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.warn('ceo.sequential_peer_intro.direct_summon_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        traceId: params.traceId,
        targetAgentId: targetId,
        error: error.slice(0, 800),
      });
      return { ok: false, error: error.slice(0, 800) };
    }
  }
}
