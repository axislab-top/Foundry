import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { PlatformSetting } from './entities/platform-setting.entity.js';
import { RoleDefaultGlobalSkillsModule } from './role-default-global-skills.module.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { PlatformSettingsController } from './platform-settings.controller.js';
import { PlatformSettingsRpcController } from './platform-settings.rpc.controller.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSetting, LlmModel]),
    RoleDefaultGlobalSkillsModule,
    MessagingModule,
  ],
  providers: [PlatformSettingsService],
  controllers: [PlatformSettingsController, PlatformSettingsRpcController],
  exports: [PlatformSettingsService, RoleDefaultGlobalSkillsModule],
})
export class PlatformSettingsModule {}

