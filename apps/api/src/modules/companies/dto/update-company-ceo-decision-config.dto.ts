import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateCompanyCeoDecisionConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ceoDecisionModel?: string | null;

  @IsOptional()
  @IsUUID()
  ceoDecisionLlmKeyId?: string | null;
}
