import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BindOrganizationNodeSkillsDto {
  @ApiProperty({ type: [String], description: 'Skill IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  skillIds: string[];
}
