import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * 创建用户DTO
 */
export class CreateUserDto {
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





































