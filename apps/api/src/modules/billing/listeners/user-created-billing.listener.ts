import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { UserCreatedEvent } from '@contracts/events';
import { UserCreditService } from '../services/user-credit.service.js';

/**
 * 用户注册时发放账号级 Credit（一次），多公司共用。
 */
@Injectable()
export class UserCreatedBillingListener implements OnModuleInit {
  private readonly logger = new Logger(UserCreatedBillingListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly userCreditService: UserCreditService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<UserCreatedEvent>(
      'user.created',
      this.handle.bind(this),
      {
        queue: 'api-user-created-billing',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: UserCreatedEvent): Promise<void> {
    const userId = event.data?.userId?.trim();
    if (!userId) return;

    try {
      await this.userCreditService.ensureRegistrationGrant(userId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('grant user credit on user.created failed', { userId, message });
    }
  }
}
