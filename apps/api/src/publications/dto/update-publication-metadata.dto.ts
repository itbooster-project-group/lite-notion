import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdatePublicationMetadataDto {
  @ApiPropertyOptional({ example: 'team-roadmap', maxLength: 100, type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seoTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seoDescription?: string | null;
}
