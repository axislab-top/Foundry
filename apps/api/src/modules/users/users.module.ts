import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller.js';
import { UsersRpcController } from './users.rpc.controller.js';
import { UsersService } from './users.service.js';
import { UserAdminContextService } from './services/user-admin-context.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { EmailVerificationService } from './services/email-verification.service.js';
import { EmailVerificationCode } from './entities/email-verification-code.entity.js';
import { User } from './entities/user.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { SecurityModule } from '../../common/security/security.module.js';
import { MailModule } from '../../common/mail/mail.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { OAuthModule } from '../oauth/oauth.module.js';

/**
 * 用户模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, PasswordResetToken, EmailVerificationCode]),
    CacheModule,
    SecurityModule,
    MailModule,
    BillingModule,
    OAuthModule,
  ],
  controllers: [UsersController, UsersRpcController],
  providers: [UsersService, UserAdminContextService, PasswordResetService, EmailVerificationService],
  exports: [UsersService, UserAdminContextService, PasswordResetService, EmailVerificationService],
})
export class UsersModule {}





































