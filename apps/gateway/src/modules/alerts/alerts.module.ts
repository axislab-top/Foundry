import { Module } from '@nestjs/common';
import { AlertsAdminController } from './alerts-admin.controller.js';

@Module({
  controllers: [AlertsAdminController],
})
export class AlertsModule {}

