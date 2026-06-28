import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { BaseEvent } from '@contracts/events';
import { CollaborationMainChainSettingsOverlayService } from './collaboration-main-chain-settings-overlay.service.js';

type PlatformSettingsCollaborationMainChainUpdatedEvent = BaseEvent & {
  eventType: 'platform.settings.collaboration_main_chain.updated';
  data?: { updatedAt?: string };
};

@Injectable()
export class CollaborationMainChainSettingsListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationMainChainSettingsListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly overlay: CollaborationMainChainSettingsOverlayService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<PlatformSettingsCollaborationMainChainUpdatedEvent>(
      'platform.settings.collaboration_main_chain.updated',
      this.handle.bind(this),
      {
        queue: 'worker-platform-settings-collab-main-chain',
        durable: true,
        prefetchCount: 4,
      },
    );
  }

  private async handle(_event: PlatformSettingsCollaborationMainChainUpdatedEvent): Promise<void> {
    this.logger.log('collaboration_main_chain.settings_updated_event');
    await this.overlay.refresh('mq');
  }
}
