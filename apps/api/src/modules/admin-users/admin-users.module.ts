import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../../common/security/security.module.js';
import { AdminUser } from './entities/admin-user.entity.js';
import { AdminUsersService } from './admin-users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser]), SecurityModule],
  providers: [AdminUsersService],
  exports: [AdminUsersService]
})
export class AdminUsersModule {}
