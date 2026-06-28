import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import type {
  CollaborationProgramPhase,
  CollaborationProgramRecord,
  DeliverableBrief,
  GoalUnderstanding,
} from '@contracts/types';
import {
  canTransitionProgramPhase,
  emptyDeliverableBrief,
  isProgramPhaseOpen,
  mergeDeliverableBrief,
  programPhaseToCollaborationMode,
  programPhaseToLifecycle,
  serializeCollaborationProgram,
  TERMINAL_PROGRAM_PHASES,
} from '@contracts/types';
import { CollaborationProgram } from '../entities/collaboration-program.entity.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { ChatRoomService } from './chat-room.service.js';

function toRecord(row: CollaborationProgram): CollaborationProgramRecord {
  return serializeCollaborationProgram({
    id: row.id,
    companyId: row.companyId,
    roomId: row.roomId,
    threadId: row.threadId,
    sourceMessageId: row.sourceMessageId,
    phase: row.phase as CollaborationProgramPhase,
    brief: row.brief,
    goalUnderstanding: (row.goalUnderstanding ?? null) as GoalUnderstanding | null,
    parentGoalTaskId: row.parentGoalTaskId,
    dispatch: (row.dispatch ?? null) as CollaborationProgramRecord['dispatch'],
    alignment: (row.alignment ?? null) as unknown as CollaborationProgramRecord['alignment'],
    lifecycle: programPhaseToLifecycle(row.phase as CollaborationProgramPhase),
    metadata: row.metadata,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  });
}

@Injectable()
export class CollaborationProgramsService {
  private readonly logger = new Logger(CollaborationProgramsService.name);

  constructor(
    @InjectRepository(CollaborationProgram)
    private readonly repo: Repository<CollaborationProgram>,
    private readonly collabRealtime: CollaborationRealtimePublisher,
    private readonly chatRoomService: ChatRoomService,
  ) {}

  async getActive(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<CollaborationProgramRecord | null> {
    const threadId = String(params.threadId ?? 'main').trim() || 'main';
    const row = await this.repo.findOne({
      where: {
        companyId: params.companyId,
        roomId: params.roomId,
        threadId,
        phase: Not(In([...TERMINAL_PROGRAM_PHASES])),
      },
      order: { updatedAt: 'DESC' },
    });
    if (!row || !isProgramPhaseOpen(row.phase as CollaborationProgramPhase)) {
      return null;
    }
    return toRecord(row);
  }

  async getById(companyId: string, programId: string): Promise<CollaborationProgramRecord | null> {
    const row = await this.repo.findOne({ where: { companyId, id: programId } });
    return row ? toRecord(row) : null;
  }

  async listByRoom(companyId: string, roomId: string, limit = 20): Promise<CollaborationProgramRecord[]> {
    const rows = await this.repo.find({
      where: { companyId, roomId },
      order: { updatedAt: 'DESC' },
      take: Math.min(50, Math.max(1, limit)),
    });
    return rows.map(toRecord);
  }

  async createIntake(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    sourceMessageId: string;
    brief?: Partial<DeliverableBrief>;
    metadata?: Record<string, unknown> | null;
  }): Promise<CollaborationProgramRecord> {
    const now = new Date();
    const threadId = String(params.threadId ?? 'main').trim() || 'main';
    const deliverableType = String(params.brief?.deliverableType ?? 'deliverable').trim() || 'deliverable';
    const brief = mergeDeliverableBrief(emptyDeliverableBrief(deliverableType), params.brief ?? {});
    const row = this.repo.create({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId,
      sourceMessageId: params.sourceMessageId,
      phase: 'intake',
      brief,
      parentGoalTaskId: null,
      dispatch: null,
      alignment: null,
      metadata: params.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    } satisfies Partial<CollaborationProgram>);
    const saved = await this.repo.save(row);
    await this.syncRoomModeFromProgram(saved);
    const record = toRecord(saved);
    void this.publishUpdated(record);
    return record;
  }

  async transitionPhase(params: {
    companyId: string;
    programId: string;
    toPhase: CollaborationProgramPhase;
    patch?: {
      brief?: Partial<DeliverableBrief>;
      goalUnderstanding?: GoalUnderstanding | null;
      parentGoalTaskId?: string | null;
      dispatch?: Record<string, unknown> | null;
      alignment?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    };
  }): Promise<CollaborationProgramRecord> {
    const row = await this.repo.findOne({ where: { companyId: params.companyId, id: params.programId } });
    if (!row) {
      throw new Error('collaboration_program_not_found');
    }
    const fromPhase = row.phase as CollaborationProgramPhase;
    const toPhase = params.toPhase;
    if (!canTransitionProgramPhase(fromPhase, toPhase)) {
      throw new Error(`collaboration_program_invalid_transition:${fromPhase}->${toPhase}`);
    }
    row.phase = toPhase;
    if (params.patch?.brief) {
      row.brief = mergeDeliverableBrief(row.brief, params.patch.brief);
    }
    if (params.patch?.goalUnderstanding !== undefined) {
      row.goalUnderstanding = params.patch.goalUnderstanding;
    }
    if (params.patch?.parentGoalTaskId !== undefined) {
      row.parentGoalTaskId = params.patch.parentGoalTaskId;
    }
    if (params.patch?.dispatch !== undefined) {
      row.dispatch = params.patch.dispatch;
    }
    if (params.patch?.alignment !== undefined) {
      row.alignment = params.patch.alignment;
    }
    if (params.patch?.metadata !== undefined) {
      row.metadata =
        params.patch.metadata === null
          ? null
          : { ...(row.metadata ?? {}), ...params.patch.metadata };
    }
    row.updatedAt = new Date();
    const saved = await this.repo.save(row);
    await this.syncRoomModeFromProgram(saved);
    const record = toRecord(saved);
    void this.publishUpdated(record);
    return record;
  }

  async confirmProgram(params: {
    companyId: string;
    programId: string;
    actorUserId: string;
  }): Promise<CollaborationProgramRecord> {
    const existing = await this.getById(params.companyId, params.programId);
    if (!existing) {
      throw new Error('collaboration_program_not_found');
    }
    if (existing.phase !== 'pending_confirm') {
      throw new Error('collaboration_program_not_awaiting_confirm');
    }
    return this.transitionPhase({
      companyId: params.companyId,
      programId: params.programId,
      toPhase: 'ready_to_plan',
      patch: {
        metadata: { confirmedBy: params.actorUserId, confirmedAt: new Date().toISOString() },
      },
    });
  }

  private async syncRoomModeFromProgram(row: CollaborationProgram): Promise<void> {
    const mode = programPhaseToCollaborationMode(row.phase as CollaborationProgramPhase);
    try {
      await this.chatRoomService.updateCollaborationMode(row.companyId, row.roomId, mode);
    } catch (e: unknown) {
      this.logger.warn('collaboration_program.room_mode_sync_failed', {
        companyId: row.companyId,
        roomId: row.roomId,
        programId: row.id,
        phase: row.phase,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async publishUpdated(record: CollaborationProgramRecord): Promise<void> {
    try {
      await this.collabRealtime.publishEnvelope({
        event: 'program:updated',
        companyId: record.companyId,
        roomId: record.roomId,
        payload: record,
      });
    } catch (e: unknown) {
      this.logger.warn('collaboration_program.realtime_publish_failed', {
        programId: record.id,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
