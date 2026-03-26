import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查询API密钥DTO
 */
export class QueryApiKeyDto {
  /**
   * 页码（从1开始）
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

  /**
   * 搜索关键词（名称或keyId）
   */
  @IsString()
  @IsOptional()
  search?: string;

  /**
   * 是否激活
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}


































