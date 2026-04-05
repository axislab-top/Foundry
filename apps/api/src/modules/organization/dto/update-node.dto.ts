import { PartialType } from '@nestjs/swagger';
import { CreateOrganizationNodeDto } from './create-organization-node.dto.js';

export class UpdateNodeDto extends PartialType(CreateOrganizationNodeDto) {}
