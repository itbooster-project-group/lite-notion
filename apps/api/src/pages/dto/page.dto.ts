import { ApiProperty } from '@nestjs/swagger';
import type { PageRecord } from '../pages.repository';
import type { PageTreeNode } from '../pages.service';

/**
 * Собирается явным перечислением полей, а не spread'ом записи: так добавление
 * колонки в модель не может случайно опубликовать её наружу. `deletedAt` в
 * контракт не входит — удалённые страницы вообще не доходят до этого слоя.
 */
export class PageDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ example: '9f6d4a5e-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  ownerId!: string;

  @ApiProperty({ example: '1b1a4c8f-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  projectId!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentPageId!: string | null;

  @ApiProperty({ example: '9f6d4a5e-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  createdById!: string;

  @ApiProperty({ example: 'Release notes', type: String })
  title!: string;

  @ApiProperty({
    description: 'Fractional rank among siblings. Server-generated, ordered lexicographically.',
    example: 'V',
    type: String,
  })
  position!: string;

  @ApiProperty({ example: '2026-08-27T12:00:00.000Z', format: 'date-time', type: String })
  createdAt!: Date;

  @ApiProperty({ example: '2026-08-27T12:00:00.000Z', format: 'date-time', type: String })
  updatedAt!: Date;

  static fromRecord(page: PageRecord): PageDto {
    return {
      createdAt: page.createdAt,
      createdById: page.createdById,
      id: page.id,
      ownerId: page.ownerId,
      parentPageId: page.parentPageId,
      position: page.position,
      projectId: page.projectId,
      title: page.title,
      updatedAt: page.updatedAt,
    };
  }
}

export class PageTreeNodeDto extends PageDto {
  @ApiProperty({ type: () => [PageTreeNodeDto] })
  children!: PageTreeNodeDto[];

  static fromNode(node: PageTreeNode): PageTreeNodeDto {
    return { ...PageDto.fromRecord(node), children: node.children.map(PageTreeNodeDto.fromNode) };
  }
}
