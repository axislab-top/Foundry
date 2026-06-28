import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { COLLABORATION_INTENT_TYPES_2026 } from '@contracts/types';

const INTENT_TYPES = [...COLLABORATION_INTENT_TYPES_2026] as const;

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export class IntentLayerRuleConditionsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  regex?: string;

  @IsOptional()
  @IsBoolean()
  requiresMention?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxLength?: number;
}

export class IntentLayerRuleDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  priority?: number;

  @IsIn(INTENT_TYPES as unknown as string[])
  intentType!: (typeof INTENT_TYPES)[number];

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsIn(RISK_LEVELS as unknown as string[])
  riskLevel!: (typeof RISK_LEVELS)[number];

  @IsString()
  reason!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => IntentLayerRuleConditionsDto)
  conditions?: IntentLayerRuleConditionsDto;
}

export class UpsertIntentLayerRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentLayerRuleDto)
  rules!: IntentLayerRuleDto[];
}
