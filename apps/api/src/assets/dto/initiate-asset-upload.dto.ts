import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitiateAssetUploadDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pageId?: string;

  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  fileName!: string;
}
