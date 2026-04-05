import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryMarketplaceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  /** 任意标签命中（与 skill_tags 数组重叠）；支持逗号分隔或重复 query */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value.filter((x: unknown) => typeof x === 'string');
    if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  skillTags?: string[];
}
