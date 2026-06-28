import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * 用户注册DTO
 * 用于用户自主注册，不包含权限相关字段
 */
export class RegisterDto {
  /**
   * 用户名
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  /**
   * 邮箱
   */
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  /**
   * 密码
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  /** 邮箱验证码（6 位数字） */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码须为 6 位数字' })
  verificationCode?: string;
}














