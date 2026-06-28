import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePlatformIntentLayerGlobalSettingsDto {
  @IsOptional()
  @IsObject()
  ceoLayers?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  llmEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ruleConfidenceThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  llmTimeoutMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  memoryInfluenceWeight?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  modelKeyId?: string;

  @IsOptional()
  @IsString()
  fallbackModel?: string;

  @IsOptional()
  @IsString()
  fallbackModelKeyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRetries?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @IsOptional()
  @IsString()
  ruleSetVersion?: string;

  @IsOptional()
  @IsBoolean()
  enableAdvancedPatterns?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  keywordBoost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fastPathThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  approvalThreshold?: number;

  @IsOptional()
  @IsBoolean()
  enableDirectAgentRouting?: boolean;

  @IsOptional()
  @IsBoolean()
  enableMultiAgentRouting?: boolean;

  @IsOptional()
  @IsBoolean()
  enableOrgNodeRouting?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBroadcastRouting?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCeoFallbackWhenTargetMissing?: boolean;

  @IsOptional()
  @IsBoolean()
  calibrationEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  calibrationMinSamples?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(50)
  calibrationApplyStep?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3600000)
  calibrationCooldownMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  calibrationMinLlmRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.005)
  @Max(0.2)
  calibrationMaxLowStep?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.005)
  @Max(0.2)
  calibrationMaxHighStep?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(0.4)
  calibrationMinGap?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(200)
  calibrationRollbackMinSamples?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.02)
  @Max(0.5)
  calibrationRollbackFallbackRatioDelta?: number;
}
