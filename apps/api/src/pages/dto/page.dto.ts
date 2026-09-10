import { PageRole } from '@lite-notion/page-permissions';
import { ApiProperty } from '@nestjs/swagger';
import type { PageRecord } from '../pages.repository';
import type { AccessiblePageTreeNode, PageTreeNode } from '../pages.service';

/** Режим наследования в контракте — строчный, как и роли: enum базы наружу не течёт. */
export type PageAccessModeDto = 'inherit' | 'restricted';

const PAGE_ACCESS_MODES: readonly PageAccessModeDto[] = ['inherit', 'restricted'];
const PAGE_ACCESS_ROLES: readonly PageRole[] = [PageRole.VIEWER, PageRole.EDITOR, PageRole.OWNER];

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

  @ApiProperty({
    description:
      'Where permission inheritance stops. `inherit` looks up the parent chain, `restricted` stops at this page.',
    enum: PAGE_ACCESS_MODES,
    example: 'inherit',
  })
  accessMode!: PageAccessModeDto;

  @ApiProperty({
    description:
      'Effective role of the current user on this page. Absence of access is not a value: an inaccessible page is not returned at all.',
    enum: PAGE_ACCESS_ROLES,
    example: 'owner',
  })
  accessRole!: PageRole;

  @ApiProperty({ example: '2026-08-27T12:00:00.000Z', format: 'date-time', type: String })
  createdAt!: Date;

  @ApiProperty({ example: '2026-08-27T12:00:00.000Z', format: 'date-time', type: String })
  updatedAt!: Date;

  static fromRecord(page: PageRecord, role: PageRole): PageDto {
    return {
      accessMode: page.accessMode === 'RESTRICTED' ? 'restricted' : 'inherit',
      accessRole: role,
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

  /**
   * Только для дерева владельца: там роль всюду `owner`, и вычислять её на каждом
   * узле незачем. В выдаче доступных страниц роль у узлов разная — ближайшее
   * разрешение побеждает, — и у неё своя фабрика.
   */
  static fromOwnedNode(node: PageTreeNode): PageTreeNodeDto {
    return {
      ...PageDto.fromRecord(node, PageRole.OWNER),
      children: node.children.map(PageTreeNodeDto.fromOwnedNode),
    };
  }

  /**
   * Для выдачи доступных страниц: роль берётся у самого узла, а не наследуется от
   * корня — ближайшее разрешение перекрывает дальнее, и у потомка она может быть уже.
   */
  static fromAccessibleNode(node: AccessiblePageTreeNode): PageTreeNodeDto {
    return {
      ...PageDto.fromRecord(node, node.role),
      children: node.children.map(PageTreeNodeDto.fromAccessibleNode),
    };
  }
}
