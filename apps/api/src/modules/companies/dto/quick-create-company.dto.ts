import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QuickCreateCompanyDto {
  @ApiProperty({ description: '自然语言描述要创建的公司', example: '一家专注短视频营销的内容创作公司，预算8000元' })
  @IsString()
  @Length(1, 8000)
  naturalLanguage: string;
}
