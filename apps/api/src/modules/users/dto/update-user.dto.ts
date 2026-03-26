import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';

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
   * 角色列表
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  /**
   * 权限列表
   */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];

  /**
   * 是否启用
   */
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}





































