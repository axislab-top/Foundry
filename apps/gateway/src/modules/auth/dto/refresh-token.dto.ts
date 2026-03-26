import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 刷新令牌 DTO
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}









































