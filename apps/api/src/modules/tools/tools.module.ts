import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillToolBinding } from '../skills/entities/skill-tool-binding.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminUser } from '../admin-users/entities/admin-user.entity.js';
import { Tool } from './entities/tool.entity.js';
import { ToolVersion } from './entities/tool-version.entity.js';
import { ToolsRpcController } from './tools.rpc.controller.js';
import { ToolsService } from './tools.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tool, ToolVersion, SkillToolBinding, User, AdminUser])],
  controllers: [ToolsRpcController],
  providers: [ToolsService],
  exports: [ToolsService, TypeOrmModule],
})
export class ToolsModule {}

