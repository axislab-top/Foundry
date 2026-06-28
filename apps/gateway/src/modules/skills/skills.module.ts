import { Module } from '@nestjs/common';
import { SkillsAdminController } from './skills-admin.controller.js';
import { CompanyToolsetSettingsController } from './company-toolset-settings.controller.js';

@Module({
  controllers: [SkillsAdminController, CompanyToolsetSettingsController],
})
export class SkillsModule {}

