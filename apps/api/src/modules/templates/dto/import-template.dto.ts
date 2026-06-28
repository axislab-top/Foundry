import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class ImportTemplateDto {
  /** 覆盖新公司显示名称；默认使用模板名称 */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  companyName?: string;

  /** 覆盖模板默认行业（展示与创建字段） */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  industry?: string;

  /** 覆盖模板默认 heartbeat 开关 */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  heartbeatEnabled?: boolean;

  /** 覆盖模板默认 heartbeat 频率 */
  @IsOptional()
  @IsIn(['hourly', 'daily', 'weekly'])
  heartbeatFrequency?: 'hourly' | 'daily' | 'weekly';

  /** 覆盖模板默认排除 director 列表 */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  excludedDirectorAgentIds?: string[];
}
