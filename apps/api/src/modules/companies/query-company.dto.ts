import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** 与 Company 实体可排序字段一致，防止任意 sortBy 注入 ORDER BY 列名导致 500 */
export const COMPANY_LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'status',
] as const;
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/utils/constants.js';

export class QueryCompanyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsIn(COMPANY_LIST_SORT_FIELDS)
  sortBy?: (typeof COMPANY_LIST_SORT_FIELDS)[number] = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  search?: string;

  /** 平台管理员：按创建人 UUID 筛选 */
  @IsOptional()
  @IsUUID()
  createdBy?: string;
}
