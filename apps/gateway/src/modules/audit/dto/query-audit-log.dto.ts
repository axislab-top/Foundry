import { IsOptional, IsString, IsInt, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查询审计日志DTO
 */
export class QueryAuditLogDto {
  /**
   * 用户ID
   */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * API密钥ID
   */
  @IsOptional()
  @IsString()
  apiKeyId?: string;

  /**
   * 服务名称
   */
  @IsOptional()
  @IsString()
  service?: string;

  /**
   * HTTP方法
   */
  @IsOptional()
  @IsString()
  method?: string;

  /**
   * 请求路径
   */
  @IsOptional()
  @IsString()
  path?: string;

  /**
   * 状态码
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusCode?: number;

  /**
   * 开始时间
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * 结束时间
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /**
   * 页码
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * 每页数量
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}


































