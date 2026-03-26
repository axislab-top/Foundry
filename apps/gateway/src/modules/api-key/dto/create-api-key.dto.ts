import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * 创建API密钥DTO
 */
export class CreateApiKeyDto {
  /**
   * 密钥名称
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  /**
   * 描述
   */
  @IsString()
  @IsOptional()
  description?: string;

  /**
   * 权限列表
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];

  /**
   * 过期时间（ISO 8601格式）
   */
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}


































