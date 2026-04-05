import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { TenantGuard } from '@service/tenant';

/**
 * 守卫模块
 * 全局模块，注册全局守卫
 */
@Global()
@Module({
  providers: [
    JwtAuthGuard,
    TenantGuard,
    RolesGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [JwtAuthGuard, RolesGuard, TenantGuard, PermissionsGuard],
})
export class GuardsModule {}



