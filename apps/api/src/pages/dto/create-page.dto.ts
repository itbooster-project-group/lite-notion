import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

import { TITLE_MAX_LENGTH } from '../constants';

export class CreatePageDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({
    description: 'Parent page. Omit or send null to create a root page.',
    format: 'uuid',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  parentPageId?: string | null;

  @ApiPropertyOptional({ default: '', maxLength: TITLE_MAX_LENGTH, type: String })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;
}
