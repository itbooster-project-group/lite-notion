import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../users/users.service';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.service';

export const NICKNAME_MAX_LENGTH = 64;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email', type: String })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada', maxLength: NICKNAME_MAX_LENGTH, minLength: 1, type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, NICKNAME_MAX_LENGTH)
  nickname!: string;

  @ApiProperty({
    description: 'bcrypt ignores anything past 72 bytes, so longer values are rejected',
    example: 'correct horse battery staple',
    maxLength: PASSWORD_MAX_LENGTH,
    minLength: PASSWORD_MIN_LENGTH,
    type: String,
  })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email', type: String })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  email!: string;

  // Верхняя граница есть, но без нижней: ограничение длины на входе не должно
  // подсказывать, каким требованиям удовлетворяет существующий пароль.
  @ApiProperty({ example: 'correct horse battery staple', type: String })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
