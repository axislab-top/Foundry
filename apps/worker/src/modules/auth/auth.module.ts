/**
 * 认证模块（Worker Service）
 */

import { Module } from '@nestjs/common';
import { LoginSuccessListener } from './listeners/login-success.listener.js';
import { LoginFailedListener } from './listeners/login-failed.listener.js';

@Module({
  providers: [
    LoginSuccessListener,
    LoginFailedListener,
  ],
})
export class AuthModule {}































