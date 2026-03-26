import { IsString, IsNotEmpty, IsOptional, IsObject, IsDateString } from 'class-validator';

/**
 * 绑定第三方账号DTO
 */
export class BindOAuthAccountDto {
  /**
   * 第三方平台提供商
   */
  @IsString()
  @IsNotEmpty()
  provider: string;

  /**
   * 第三方平台的用户ID
   */
  @IsString()
  @IsNotEmpty()
  providerUserId: string;

  /**
   * 第三方平台的用户名
   */
  @IsString()
  @IsOptional()
  providerUsername?: string;

  /**
   * 访问令牌
   */
  @IsString()
  @IsOptional()
  accessToken?: string;

  /**
   * 刷新令牌
   */
  @IsString()
  @IsOptional()
  refreshToken?: string;

  /**
   * Token过期时间
   */
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  /**
   * 第三方平台的用户信息
   */
  @IsObject()
  @IsOptional()
  profileData?: Record<string, any>;
}

/**
 * 查找或创建用户DTO
 */
export class FindOrCreateUserDto {
  /**
   * 第三方平台提供商
   */
  @IsString()
  @IsNotEmpty()
  provider: string;

  /**
   * 第三方平台的用户ID
   */
  @IsString()
  @IsNotEmpty()
  providerUserId: string;

  /**
   * 第三方平台的用户名
   */
  @IsString()
  @IsOptional()
  providerUsername?: string;

  /**
   * 邮箱（可选，用于账号合并）
   */
  @IsString()
  @IsOptional()
  email?: string;

  /**
   * 第三方平台的用户信息
   */
  @IsObject()
  @IsOptional()
  profileData?: Record<string, any>;
}



































