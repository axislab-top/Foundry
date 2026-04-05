import { Module } from '@nestjs/common';
import { CompanyCreatedListener } from './listeners/company-created.listener.js';
import { CompanyUpdatedListener } from './listeners/company-updated.listener.js';
import { CompanyStatusChangedListener } from './listeners/company-status-changed.listener.js';

@Module({
  providers: [
    CompanyCreatedListener,
    CompanyUpdatedListener,
    CompanyStatusChangedListener,
  ],
})
export class CompaniesModule {}
