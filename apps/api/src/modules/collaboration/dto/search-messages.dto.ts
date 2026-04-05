import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchChatMessagesDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  q?: string;

  @IsOptional()
  @IsIn(['human', 'agent'])
  senderType?: 'human' | 'agent';

  @IsOptional()
  @IsUUID()
  senderId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
