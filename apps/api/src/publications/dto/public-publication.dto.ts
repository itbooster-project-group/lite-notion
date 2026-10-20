import { ApiProperty } from '@nestjs/swagger';
import type { PublicAssetDescriptor, PublicPublicationView } from '../publications-read.service';

export class PublicAssetDescriptorDto {
  @ApiProperty({ format: 'uuid', type: String })
  assetId!: string;

  @ApiProperty({ type: String })
  mimeType!: string;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({
    type: String,
    example: '/api/v1/public/publications/team-roadmap/assets/00000000-0000-4000-8000-000000000000',
  })
  resolverPath!: string;

  static fromDescriptor(descriptor: PublicAssetDescriptor): PublicAssetDescriptorDto {
    return { ...descriptor };
  }
}

export class PublicPublicationDto {
  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  seoTitle!: string;

  @ApiProperty({ type: String, nullable: true })
  seoDescription!: string | null;

  @ApiProperty({ type: Number })
  schemaVersion!: number;

  @ApiProperty({ type: Object })
  contentJson!: unknown;

  @ApiProperty({ type: [PublicAssetDescriptorDto] })
  assets!: PublicAssetDescriptorDto[];

  @ApiProperty({ type: PublicAssetDescriptorDto, nullable: true })
  cover!: PublicAssetDescriptorDto | null;

  static fromView(view: PublicPublicationView): PublicPublicationDto {
    return {
      ...view,
      assets: view.assets.map(PublicAssetDescriptorDto.fromDescriptor),
      cover: view.cover ? PublicAssetDescriptorDto.fromDescriptor(view.cover) : null,
    };
  }
}
