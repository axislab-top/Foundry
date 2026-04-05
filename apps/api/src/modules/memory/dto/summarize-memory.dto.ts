import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SummarizeMemoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsString({ each: true })
  texts!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;

  @IsOptional()
  @IsBoolean()
  structured?: boolean;

  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  persistNamespace?: string;
}
