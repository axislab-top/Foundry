import { Module } from '@nestjs/common';
import { McpToolsAdminController } from './mcp-tools-admin.controller.js';

@Module({
  controllers: [McpToolsAdminController],
})
export class McpToolsModule {}

