import { ApiProperty } from '@nestjs/swagger';

import type { ProjectRecord } from '../projects.repository';

/**
 * Собирается явным перечислением полей, а не spread'ом записи: так добавление
 * колонки в модель не может случайно опубликовать её наружу.
 */
export class ProjectDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ example: '9f6d4a5e-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  ownerId!: string;

  @ApiProperty({ example: 'Workspace', type: String })
  name!: string;

  static fromRecord(project: ProjectRecord): ProjectDto {
    return { id: project.id, name: project.name, ownerId: project.ownerId };
  }
}
