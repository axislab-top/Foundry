import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';

/**
 * 验证凭证DTO
 */
export class ValidateCredentialsDto {
  /**
   * 邮箱
   */
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  /**
   * 密码
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}





































