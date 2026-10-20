import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class RepublishPageDto {
  @ApiPropertyOptional({ example: 'team-roadmap', maxLength: 100, type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  slug?: string;
}
