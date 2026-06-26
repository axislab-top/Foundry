import { Injectable, Logger } from '@nestjs/common';
import { CeoSequentialPeerIntroSessionService } from './ceo-sequential-peer-intro-session.service.js';
import { ReplayPeerSummonDirectService } from './replay-peer-summon-direct.service.js';

export type CeoSequentialPeerIntroContinuationResult = {
  continued: boolean;
  reason?: string;
  toolCallsExecuted?: number;
  toolNames?: string[];
};

/**
 * 总监完成自我介绍后，服务端直连 summon 推进下一位（不依赖 LLM tool loop）。
 */
@Injectable()
export class CeoSequentialPeerIntroContinuationService {
  private readonly logger = new Logger(CeoSequentialPeerIntroContinuationService.name);

  constructor(
    private readonly session: CeoSequentialPeerIntroSessionService,
    private readonly peerSummonDirect: ReplayPeerSummonDirectService,
  ) {}

  async continueViaCeoToolPath(params: {
    companyId: string;
    roomId: string;
    threadId: string | null;
    completedDirectorAgentId: string;
    anchorMessageId: string;
    traceId: string;
    ceoAgentId: string;
  }): Promise<CeoSequentialPeerIntroContinuationResult> {
    const shouldContinue = await this.session.shouldContinueAfterDirectorReply(
      params.companyId,
      params.roomId,
      params.completedDirectorAgentId,
    );
    if (!shouldContinue) {
      return { continued: false, reason: 'not_chain_turn' };
    }

    const acquired = await this.session.acquireChainContinueSlot(
      params.companyId,
      params.roomId,
      params.completedDirectorAgentId,
    );
    if (!acquired) {
      return { continued: false, reason: 'chain_continue_dedupe' };
    }

    const next = await this.session.pickNextDirector(params.companyId, params.roomId);
    if (!next) {
      await this.session.deactivateSession(params.companyId, params.roomId);
      this.logger.log('ceo.sequential_peer_intro.chain_complete', {
        companyId: params.companyId,
        roomId: params.roomId,
        completedDirectorAgentId: params.completedDirectorAgentId,
      });
      return { continued: false, reason: 'all_directors_summoned' };
    }

    const completedDirector = await this.session.findDirectorById(
      params.companyId,
      params.roomId,
      params.completedDirectorAgentId,
    );
    const completedName = completedDirector?.displayName ?? '上一位主管';
    const content = `${completedName} 已完成自我介绍。有请 @${next.displayName} 继续。`;

    const direct = await this.peerSummonDirect.summonDirectorInMainRoom({
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.anchorMessageId,
      traceId: `${params.traceId}:chain:${next.agentId}`,
      threadId: params.threadId,
      ceoAgentId: params.ceoAgentId,
      targetAgentId: next.agentId,
      targetDisplayName: next.displayName,
      content,
    });

    if (!direct.ok) {
      this.logger.warn('ceo.sequential_peer_intro.chain_direct_summon_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        anchorMessageId: params.anchorMessageId,
        completedDirectorAgentId: params.completedDirectorAgentId,
        expectedNextAgentId: next.agentId,
        error: direct.error ?? null,
      });
      return {
        continued: false,
        reason: 'direct_summon_failed',
        toolCallsExecuted: 0,
        toolNames: [],
      };
    }

    this.logger.log('ceo.sequential_peer_intro.chain_continued_via_direct_summon', {
      companyId: params.companyId,
      roomId: params.roomId,
      completedDirectorAgentId: params.completedDirectorAgentId,
      nextTargetAgentId: next.agentId,
      traceId: params.traceId,
    });
    return {
      continued: true,
      toolCallsExecuted: 1,
      toolNames: ['tool.message_send_to_agent'],
    };
  }
}
