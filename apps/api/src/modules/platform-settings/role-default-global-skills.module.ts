import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from './entities/platform-setting.entity.js';
import { RoleDefaultGlobalSkillsService } from './role-default-global-skills.service.js';

/**
 * 独立模块：按角色默认全局 Skill 名读写。
 * 不依赖 CompaniesModule，供 SkillsModule 使用以避免 ESM 循环依赖。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [RoleDefaultGlobalSkillsService],
  exports: [RoleDefaultGlobalSkillsService],
})
export class RoleDefaultGlobalSkillsModule {}
