import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 登出 DTO
 */
export class LogoutDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}









































