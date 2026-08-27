import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { PROJECT_NAME_MAX_LENGTH } from '../constants';

export class CreateProjectDto {
  @ApiProperty({
    example: 'Workspace',
    maxLength: PROJECT_NAME_MAX_LENGTH,
    minLength: 1,
    type: String,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, PROJECT_NAME_MAX_LENGTH)
  name!: string;
}
