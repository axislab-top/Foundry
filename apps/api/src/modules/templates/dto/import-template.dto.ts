import { IsOptional, IsString, Length } from 'class-validator';

export class ImportTemplateDto {
  /** 覆盖新公司显示名称；默认使用模板名称 */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  companyName?: string;
}
