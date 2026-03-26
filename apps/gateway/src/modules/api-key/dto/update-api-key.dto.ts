import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * 更新API密钥DTO
 */
export class UpdateApiKeyDto {
  /**
   * 密钥名称
   */
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

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

  /**
   * 是否激活
   */
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}


































