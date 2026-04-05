import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantGuard } from './guards/tenant.guard.js';
import { TenantService } from './services/tenant.service.js';
import { TenantContextService } from './services/tenant-context.service.js';
import { TenantRlsService } from './services/tenant-rls.service.js';
import { TenantTypeormContextBootstrapper } from './services/tenant-typeorm-context-bootstrapper.service.js';
import { TenantResolutionStrategy } from './strategies/tenant-resolution.strategy.js';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
  ],
  providers: [
    TenantService,
    TenantContextService,
    TenantRlsService,
    TenantTypeormContextBootstrapper,
    TenantResolutionStrategy,
    TenantGuard,
  ],
  exports: [
    ClsModule,
    TenantService,
    TenantContextService,
    TenantRlsService,
    TenantTypeormContextBootstrapper,
    TenantResolutionStrategy,
    TenantGuard,
  ],
})
export class TenantModule {}
