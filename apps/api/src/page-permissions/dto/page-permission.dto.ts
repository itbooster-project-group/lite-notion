import { ApiProperty } from '@nestjs/swagger';

import { GRANTABLE_ROLES, type GrantableRole } from '../constants';
import type { PagePermissionRecord } from '../page-permissions.repository';

/**
 * Прямое разрешение в контракте. Идентификатор пользователя нужен, чтобы адресовать
 * отзыв; email и имя — чтобы клиент показал, кому именно открыт доступ.
 */
export class PagePermissionDto {
  @ApiProperty({ example: '9f6d4a5e-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  userId!: string;

  @ApiProperty({ example: 'teammate@example.com', format: 'email', type: String })
  email!: string;

  @ApiProperty({ example: 'Alex Teammate', type: String })
  name!: string;

  @ApiProperty({ enum: GRANTABLE_ROLES, example: 'viewer' })
  role!: GrantableRole;

  @ApiProperty({ example: '2026-09-10T12:00:00.000Z', format: 'date-time', type: String })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-10T12:00:00.000Z', format: 'date-time', type: String })
  updatedAt!: Date;

  static fromRecord(record: PagePermissionRecord): PagePermissionDto {
    return {
      createdAt: record.createdAt,
      email: record.email,
      name: record.name,
      role: record.role === 'EDITOR' ? 'editor' : 'viewer',
      updatedAt: record.updatedAt,
      userId: record.userId,
    };
  }
}
