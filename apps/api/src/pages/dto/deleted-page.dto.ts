import { ApiProperty } from '@nestjs/swagger';

import type { DeletedPageRecord } from '../pages.repository';
import type { DeletedPageTreeNode } from '../pages.service';

/**
 * Отдельный DTO, а не `PageDto` с nullable-полем: у живой страницы `deletedAt`
 * всегда `null`. `deletedOrigin` не публикуется — вложенность ответа уже несёт всё,
 * что он кодирует.
 */
export class DeletedPageDto {
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

  @ApiProperty({
    description: 'When the page was moved to the trash. Retention is counted from this moment.',
    example: '2026-08-30T12:00:00.000Z',
    format: 'date-time',
    type: String,
  })
  deletedAt!: Date;

  static fromRecord(page: DeletedPageRecord): DeletedPageDto {
    return {
      createdAt: page.createdAt,
      createdById: page.createdById,
      deletedAt: page.deletedAt,
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

export class DeletedPageTreeNodeDto extends DeletedPageDto {
  @ApiProperty({ type: () => [DeletedPageTreeNodeDto] })
  children!: DeletedPageTreeNodeDto[];

  static fromNode(node: DeletedPageTreeNode): DeletedPageTreeNodeDto {
    return {
      ...DeletedPageDto.fromRecord(node),
      children: node.children.map(DeletedPageTreeNodeDto.fromNode),
    };
  }
}
