import { IsString, IsEmail, IsNotEmpty, MinLength } from 'class-validator';

/**
 * 登录 DTO
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}









































