import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateLlmKeyRpcDto } from './create-llm-key.dto.js';

export class ImportLlmKeysDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLlmKeyRpcDto)
  items: CreateLlmKeyRpcDto[];
}

