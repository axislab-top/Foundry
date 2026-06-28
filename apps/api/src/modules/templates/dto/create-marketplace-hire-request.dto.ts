import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateMarketplaceHireRequestDto {
  @IsUUID()
  marketplaceAgentId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsIn(['permanent', 'temporary'])
  employmentType?: 'permanent' | 'temporary';

  /** 临时雇佣绑定项目（当前对齐 tasks.id） */
  @ValidateIf((o) => o.employmentType === 'temporary')
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requestedReason?: string;
}
