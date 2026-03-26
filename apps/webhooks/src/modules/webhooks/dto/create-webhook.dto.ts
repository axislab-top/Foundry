import {
  IsString,
  IsUrl,
  IsArray,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ description: 'Webhook 名称', example: 'user-created-webhook' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: '描述', example: '用户创建事件 Webhook' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '目标 URL', example: 'https://example.com/webhook' })
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url: string;

  @ApiProperty({
    description: '事件列表',
    example: ['user.created', 'user.updated'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ description: '签名密钥', example: 'your-secret-key' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '重试次数', default: 3, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryCount?: number;

  @ApiPropertyOptional({
    description: '超时时间（毫秒）',
    default: 30000,
    minimum: 1000,
    maximum: 60000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeout?: number;
}
