import { Module } from '@nestjs/common';
import { CompanySpaceController } from './company-space.controller.js';

@Module({
  controllers: [CompanySpaceController],
})
export class CompanySpaceModule {}
