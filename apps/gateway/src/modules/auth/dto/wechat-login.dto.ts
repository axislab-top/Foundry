import { IsString, IsOptional } from 'class-validator';

/**
 * 微信登录回调 DTO
 */
export class WechatCallbackDto {
  /**
   * 授权码
   */
  @IsString()
  code: string;

  /**
   * 状态参数（用于防止 CSRF 攻击）
   */
  @IsString()
  @IsOptional()
  state?: string;
}



































