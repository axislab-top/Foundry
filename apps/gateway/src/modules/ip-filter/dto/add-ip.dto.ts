import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * 添加IP到黑白名单DTO
 */
export class AddIpDto {
  /**
   * IP地址或CIDR网段
   * 支持格式：
   * - 单个IP: 192.168.1.1
   * - IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
   * - CIDR: 192.168.1.0/24
   * - IPv6 CIDR: 2001:db8::/32
   */
  @IsString()
  @IsNotEmpty()
  ip: string;

  /**
   * 路由路径（可选，如果提供则仅对该路由生效）
   */
  @IsString()
  @IsOptional()
  route?: string;

  /**
   * 备注说明
   */
  @IsString()
  @IsOptional()
  description?: string;
}

































