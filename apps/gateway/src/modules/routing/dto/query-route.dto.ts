import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查询路由DTO
 */
export class QueryRouteDto {
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

  /**
   * 搜索关键词
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

  /**
   * 服务类型
   */
  @IsString()
  @IsOptional()
  service?: string;
}


































