import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillMcpToolBinding } from '../skills/entities/skill-mcp-tool-binding.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminUser } from '../admin-users/entities/admin-user.entity.js';
import { McpTool } from './entities/mcp-tool.entity.js';
import { McpToolVersion } from './entities/mcp-tool-version.entity.js';
import { McpToolsRpcController } from './mcp-tools.rpc.controller.js';
import { McpToolsService } from './mcp-tools.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([McpTool, McpToolVersion, SkillMcpToolBinding, User, AdminUser])],
  controllers: [McpToolsRpcController],
  providers: [McpToolsService],
  exports: [McpToolsService, TypeOrmModule],
})
export class McpToolsModule {}

