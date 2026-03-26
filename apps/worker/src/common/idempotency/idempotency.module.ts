import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service.js';

@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}

