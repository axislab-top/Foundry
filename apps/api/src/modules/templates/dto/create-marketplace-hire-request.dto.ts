import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMarketplaceHireRequestDto {
  @IsUUID()
  marketplaceAgentId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requestedReason?: string;
}
