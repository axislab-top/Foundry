import { Module } from '@nestjs/common';
import { SkillsAdminController } from './skills-admin.controller.js';

@Module({
  controllers: [SkillsAdminController],
})
export class SkillsModule {}

