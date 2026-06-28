import { Module } from '@nestjs/common';
import { ToolsAdminController } from './tools-admin.controller.js';

@Module({
  controllers: [ToolsAdminController],
})
export class ToolsModule {}

