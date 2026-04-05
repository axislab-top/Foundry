import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller.js';

@Module({
  controllers: [AdminDashboardController],
})
export class AdminDashboardModule {}

