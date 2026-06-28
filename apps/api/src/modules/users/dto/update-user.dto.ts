import { IsString, IsOptional, IsEmail, IsBoolean, MinLength, MaxLength } from 'class-validator';

/**
 * 更新用户DTO
 */
export class UpdateUserDto {
  /**
   * 用户名
   */
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(100)
  username?: string;

  /**
   * 邮箱
   */
  @IsString()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  /**
   * 是否启用
   */
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}





































