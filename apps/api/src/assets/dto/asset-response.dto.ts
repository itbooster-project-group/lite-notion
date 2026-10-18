import { ApiProperty } from '@nestjs/swagger';

export class AssetResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['pending', 'ready', 'failed', 'deleted'] })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  mimeType!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ type: String })
  originalName!: string;
}

export class AssetUploadInitiatedDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string;

  @ApiProperty({ type: String })
  contentPath!: string;
}

export class AssetReadUrlDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: Number })
  expiresInSeconds!: number;
}
