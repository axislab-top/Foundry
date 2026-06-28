import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class BindAgentSkillsDto {
  @ApiProperty({ type: [String], description: 'Skill IDs' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  skillIds: string[];

  @ApiPropertyOptional({ description: 'Binding source label (e.g. ceo-plan-node)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Whether this binding is temporary' })
  @IsOptional()
  @IsBoolean()
  isTemporary?: boolean;

  @ApiPropertyOptional({ description: 'Optional expiration time (ISO-8601); only meaningful when isTemporary=true' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Lock binding to a specific published revision version (integer)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ description: 'Lock binding with semver label (e.g. 1.2.3)' })
  @IsOptional()
  @IsString()
  semverVersion?: string;
}
