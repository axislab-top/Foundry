import { Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { AlertWebhookService } from './alert-webhook.service.js';
import { TaskRunFailedWebhookListener } from './task-run-failed-webhook.listener.js';

@Module({
  imports: [ConfigModule],
  providers: [AlertWebhookService, TaskRunFailedWebhookListener],
  exports: [AlertWebhookService],
})
export class AlertsWorkerModule {}
