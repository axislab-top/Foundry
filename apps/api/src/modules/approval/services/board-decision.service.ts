import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardDecision } from '../entities/board-decision.entity.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';

@Injectable()
export class BoardDecisionService {
  constructor(
    @InjectRepository(BoardDecision)
    private readonly repo: Repository<BoardDecision>,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly rooms: ChatRoomService,
  ) {}

  async open(params: {
    companyId: string;
    approvalFlowId: string;
    quorum?: number;
    expiresAt?: Date | null;
  }): Promise<BoardDecision> {
    const row = this.repo.create({
      companyId: params.companyId,
      approvalFlowId: params.approvalFlowId,
      status: 'open',
      quorum: Math.min(Math.max(params.quorum ?? 1, 1), 99),
      votes: {},
      finalDecision: null,
      finalReason: null,
      expiresAt: params.expiresAt ?? null,
      resolvedAt: null,
    });
    const saved = await this.repo.save(row);
    await this.broadcast(saved, { event: 'board.decision.opened' });
    return saved;
  }

  async vote(params: {
    companyId: string;
    boardDecisionId: string;
    actorId: string;
    vote: 'approved' | 'rejected' | 'abstain';
    reason?: string;
  }): Promise<BoardDecision> {
    const row = await this.repo.findOne({ where: { id: params.boardDecisionId, companyId: params.companyId } });
    if (!row) throw Object.assign(new Error('board decision not found'), { status: 404 });
    if (row.status !== 'open') throw Object.assign(new Error(`board decision not open: ${row.status}`), { status: 409 });
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      row.status = 'expired';
      row.resolvedAt = new Date();
      await this.repo.save(row);
      await this.broadcast(row, { event: 'board.decision.expired' });
      return row;
    }

    row.votes = { ...(row.votes ?? {}), [params.actorId]: params.vote };
    const saved = await this.repo.save(row);

    await this.broadcast(saved, {
      event: 'board.decision.voted',
      actorId: params.actorId,
      vote: params.vote,
    });

    // finalize if quorum reached (simple majority of non-abstain among quorum votes)
    const final = await this.tryFinalize(saved, params.reason);
    return final ?? saved;
  }

  private async tryFinalize(row: BoardDecision, reason?: string): Promise<BoardDecision | null> {
    const votes = Object.values(row.votes ?? {}).filter((v) => v !== 'abstain');
    if (votes.length < row.quorum) return null;
    const approveCount = votes.filter((v) => v === 'approved').length;
    const rejectCount = votes.filter((v) => v === 'rejected').length;
    const decision: 'approved' | 'rejected' = approveCount >= rejectCount ? 'approved' : 'rejected';

    row.status = decision === 'approved' ? 'passed' : 'rejected';
    row.finalDecision = decision;
    row.finalReason = reason ?? null;
    row.resolvedAt = new Date();
    const saved = await this.repo.save(row);
    await this.broadcast(saved, { event: 'board.decision.finalized' });
    return saved;
  }

  private async broadcast(row: BoardDecision, extra: Record<string, unknown>): Promise<void> {
    const main = await this.rooms.findMainRoom(row.companyId);
    const roomId = main?.id ?? null;
    if (!roomId) return;
    await this.collabRealtime.publishEnvelope({
      event: 'board:decision',
      companyId: row.companyId,
      roomId,
      payload: {
        boardDecisionId: row.id,
        approvalFlowId: row.approvalFlowId,
        status: row.status,
        quorum: row.quorum,
        votes: row.votes,
        finalDecision: row.finalDecision,
        finalReason: row.finalReason,
        resolvedAt: row.resolvedAt?.toISOString?.() ?? null,
        ...extra,
      },
    });
  }
}

