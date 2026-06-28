import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyRuntimePreference } from './entities/company-runtime-preference.entity.js';
import { CompanyHeartbeatConfig } from './entities/company-heartbeat-config.entity.js';
import { CompanyRuntimePreferenceService } from './services/company-runtime-preference.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyRuntimePreference, CompanyHeartbeatConfig])],
  providers: [CompanyRuntimePreferenceService],
  exports: [CompanyRuntimePreferenceService, TypeOrmModule],
})
export class CompanyRuntimePreferenceModule {}
