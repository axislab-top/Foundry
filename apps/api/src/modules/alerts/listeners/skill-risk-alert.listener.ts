import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { SkillExecutedEvent } from '@contracts/events';
import { AlertsService } from '../alerts.service.js';

/**
 * Skill 执行风险：基于入参/返回的简易启发式扫描生成告警。
 */
@Injectable()
export class SkillRiskAlertListener implements OnModuleInit {
  private readonly logger = new Logger(SkillRiskAlertListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<SkillExecutedEvent>('skill.executed', (event) => {
      return this.alerts.createFromSkillEvent(event).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn('skill risk alert create failed', { message: msg });
      });
    }, {
      queue: 'api-alerts-skill-executed',
      durable: true,
      prefetchCount: 20,
    });
  }
}

