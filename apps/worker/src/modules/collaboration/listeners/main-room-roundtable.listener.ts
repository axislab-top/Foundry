import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import {
  COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
  type CollaborationMainRoomRoundtableStepEvent,
} from '@contracts/events';
import { MainRoomRoundtableService } from '../main-room-roundtable.service.js';

@Injectable()
export class MainRoomRoundtableListener implements OnModuleInit {
  private readonly logger = new Logger(MainRoomRoundtableListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly roundtable: MainRoomRoundtableService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CollaborationMainRoomRoundtableStepEvent>(
      'collaboration.main-room.roundtable.worker',
      async (event) => {
        try {
          await this.roundtable.handleStep(event);
        } catch (e: unknown) {
          this.logger.warn('main_room_roundtable.handle_step_failed', {
            error: e instanceof Error ? e.message : String(e),
            sessionId: event?.data?.sessionId,
          });
        }
      },
      {
        queue: 'worker-collaboration-main-room-roundtable-queue',
        routingKey: COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY,
        durable: true,
        prefetchCount: 4,
      },
    );
  }
}
