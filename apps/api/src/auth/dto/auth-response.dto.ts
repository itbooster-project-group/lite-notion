import { ApiProperty } from '@nestjs/swagger';

import type { UserRecord } from '../../users/users.service';

/**
 * Собирается явным перечислением полей, а не spread'ом записи пользователя:
 * так добавление колонки в модель не может случайно опубликовать её наружу.
 */
export class UserProfileDto {
  @ApiProperty({ example: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d', format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ example: 'ada@example.com', format: 'email', type: String })
  email!: string;

  @ApiProperty({ example: 'Ada', type: String })
  nickname!: string;

  @ApiProperty({ example: '2026-08-21T12:00:00.000Z', format: 'date-time', type: String })
  createdAt!: Date;

  static fromUser(user: UserRecord): UserProfileDto {
    return {
      createdAt: user.createdAt,
      email: user.email,
      id: user.id,
      nickname: user.nickname,
    };
  }
}

export class TokenResponseDto {
  @ApiProperty({
    description: 'Short-lived bearer token. The refresh token is sent as an HttpOnly cookie.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    type: String,
  })
  accessToken!: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900, type: Number })
  expiresIn!: number;
}

/**
 * Обновление возвращает только токены: профиль там не нужен, а лишний запрос
 * к базе на горячем пути обновления противоречил бы смыслу схемы.
 */
export class AuthResponseDto extends TokenResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}
