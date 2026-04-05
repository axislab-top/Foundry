import { Module } from '@nestjs/common';
import { OrganizationStructureChangedListener } from './listeners/organization-structure-changed.listener.js';

@Module({
  providers: [OrganizationStructureChangedListener],
})
export class OrganizationModule {}
