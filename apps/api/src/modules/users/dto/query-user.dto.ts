import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/utils/constants.js';

/**
 * 查询用户DTO
 */
export class QueryUserDto {
  /**
   * 页码
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * 每页数量
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  /**
   * 排序字段
   */
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  /**
   * 排序方向
   */
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  /**
   * 搜索关键词（搜索用户名和邮箱）
   */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * 是否启用筛选
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  /**
   * 删除状态筛选
   * 'false' 或 undefined: 只显示未删除的（默认）
   * 'true': 只显示已删除的
   * 'all': 显示全部（包括已删除和未删除的）
   */
  @IsOptional()
  @IsIn(['false', 'true', 'all'])
  @IsString()
  deleted?: 'false' | 'true' | 'all' = 'false';

  /**
   * 平台管理员列表：附带企业/购额统计（ownedCompanyCount 等）
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeStats?: boolean;
}





































