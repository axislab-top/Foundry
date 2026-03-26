import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 列出文件 DTO
 */
export class ListFilesDto {
  /**
   * 路径前缀（可选）
   */
  @IsOptional()
  @IsString()
  prefix?: string;

  /**
   * 最大返回数量（可选）
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxKeys?: number;

  /**
   * 起始标记（用于分页，可选）
   */
  @IsOptional()
  @IsString()
  marker?: string;

  /**
   * 是否递归列出子目录（可选）
   */
  @IsOptional()
  @IsString()
  recursive?: string;
}































