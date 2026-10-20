import { ApiProperty } from '@nestjs/swagger';
import { PagePublicationStatus } from '../../generated/prisma/enums';
import type { PublicationRecord } from '../publications.repository';
import type { PublicationManagementView } from '../publications-read.service';

export class PublicationManagementDto {
  @ApiProperty({ enum: PagePublicationStatus })
  status!: PagePublicationStatus;

  @ApiProperty({ type: String })
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  seoTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  seoDescription!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, example: '/p/team-roadmap' })
  publicPath!: string | null;

  static fromView(view: PublicationManagementView): PublicationManagementDto {
    return { ...view };
  }

  static fromRecord(record: PublicationRecord): PublicationManagementDto {
    return {
      publishedAt: record.publishedAt,
      publicPath: record.status === 'published' ? `/p/${record.slug}` : null,
      seoDescription: record.seoDescription,
      seoTitle: record.seoTitle,
      slug: record.slug,
      status: record.status,
    };
  }
}
