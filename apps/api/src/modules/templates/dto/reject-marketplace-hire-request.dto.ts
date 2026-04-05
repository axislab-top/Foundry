import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectMarketplaceHireRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string;
}
