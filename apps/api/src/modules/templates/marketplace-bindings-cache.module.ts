import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { MarketplaceAgentKeyBinding } from './entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceBindingsCacheService } from './marketplace-bindings-cache.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceAgentKeyBinding]), CacheModule],
  providers: [MarketplaceBindingsCacheService],
  exports: [MarketplaceBindingsCacheService],
})
export class MarketplaceBindingsCacheModule {}
