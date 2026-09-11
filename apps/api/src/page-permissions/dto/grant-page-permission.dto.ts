import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';

import { normalizeEmail } from '../../common/helpers';
import { GRANTABLE_ROLES, type GrantableRole } from '../constants';

/**
 * Разрешение выдаётся по email, а не по идентификатору: операции поиска
 * пользователей в API нет, и взять идентификатор клиенту негде.
 */
export class GrantPagePermissionDto {
  @ApiProperty({ example: 'teammate@example.com', format: 'email', type: String })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email!: string;

  @ApiProperty({
    description: 'Role to grant. `owner` is not accepted: ownership is not transferable here.',
    enum: GRANTABLE_ROLES,
    example: 'viewer',
  })
  @IsIn(GRANTABLE_ROLES)
  role!: GrantableRole;
}
