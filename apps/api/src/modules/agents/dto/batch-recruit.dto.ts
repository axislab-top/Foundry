import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecruitTemplateDto } from './recruit-template.dto.js';

export class BatchRecruitItemDto {
  @ApiPropertyOptional({
    description:
      '已有组织节点 ID（count=1 时绑定该节点；count>1 且 role=executor 时作为父部门，在其下创建 count 个子 agent 节点）',
  })
  @IsOptional()
  @IsUUID()
  organizationNodeId?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => RecruitTemplateDto)
  template: RecruitTemplateDto;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  count: number;
}

export class BatchRecruitDto {
  @ApiProperty({ type: [BatchRecruitItemDto] })
  @ValidateNested({ each: true })
  @Type(() => BatchRecruitItemDto)
  items: BatchRecruitItemDto[];
}
