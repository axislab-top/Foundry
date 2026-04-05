import { Module } from '@nestjs/common';
import { MarketplaceAdminController } from './marketplace-admin.controller.js';

@Module({
  controllers: [MarketplaceAdminController],
})
export class MarketplaceModule {}

