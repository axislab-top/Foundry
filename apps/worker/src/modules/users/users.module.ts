/**
 * 用户模块（Worker Service）
 */

import { Module } from '@nestjs/common';
import { UserCreatedListener } from './listeners/user-created.listener.js';
import { UserUpdatedListener } from './listeners/user-updated.listener.js';
import { UserDeletedListener } from './listeners/user-deleted.listener.js';

@Module({
  providers: [
    UserCreatedListener,
    UserUpdatedListener,
    UserDeletedListener,
  ],
})
export class UsersModule {}































