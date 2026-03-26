import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * IP过滤类型
 */
export enum IpFilterType {
  WHITELIST = 'whitelist',
  BLACKLIST = 'blacklist',
}

/**
 * 查询IP过滤规则DTO
 */
export class QueryIpFilterDto {
  /**
   * 过滤类型（白名单或黑名单）
   */
  @IsEnum(IpFilterType)
  @IsOptional()
  type?: IpFilterType;

  /**
   * 路由路径（可选，过滤特定路由）
   */
  @IsString()
  @IsOptional()
  route?: string;
}

































