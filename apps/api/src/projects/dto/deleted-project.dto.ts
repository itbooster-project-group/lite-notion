import { ApiProperty } from '@nestjs/swagger';

import type { DeletedProjectRecord } from '../projects.repository';

/**
 * Проект в корзине. Страниц не содержит намеренно: удалённая страница
 * показывается ровно в одном месте — в корзине страниц, — и второго способа
 * увидеть её быть не должно.
 */
export class DeletedProjectDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ example: '9f6d4a5e-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  ownerId!: string;

  @ApiProperty({ example: 'Workspace', type: String })
  name!: string;

  @ApiProperty({
    description: 'When the project was moved to the trash. Retention is counted from this moment.',
    example: '2026-08-30T12:00:00.000Z',
    format: 'date-time',
    type: String,
  })
  deletedAt!: Date;

  static fromRecord(project: DeletedProjectRecord): DeletedProjectDto {
    return {
      deletedAt: project.deletedAt,
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
    };
  }
}
