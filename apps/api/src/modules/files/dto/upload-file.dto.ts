import { IsOptional, IsString, IsBoolean } from 'class-validator';

/**
 * 上传文件 DTO
 */
export class UploadFileDto {
  /**
   * 存储路径（可选）
   */
  @IsOptional()
  @IsString()
  path?: string;

  /**
   * 内容类型（可选）
   */
  @IsOptional()
  @IsString()
  contentType?: string;

  /**
   * 是否公开访问（可选）
   */
  @IsOptional()
  @IsString()
  public?: string;

  /**
   * 元数据（JSON 字符串，可选）
   */
  @IsOptional()
  @IsString()
  metadata?: string;
}































