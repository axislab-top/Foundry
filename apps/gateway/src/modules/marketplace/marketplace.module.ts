import { Module } from '@nestjs/common';
import { MarketplaceAdminController } from './marketplace-admin.controller.js';
import { PlatformDepartmentsAdminController } from './platform-departments-admin.controller.js';

@Module({
  controllers: [MarketplaceAdminController, PlatformDepartmentsAdminController],
})
export class MarketplaceModule {}

