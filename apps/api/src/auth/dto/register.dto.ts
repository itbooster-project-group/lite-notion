import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';

import { normalizeEmail } from '../../common/helpers';
import {
  NAME_MAX_LENGTH,
  PASSWORD_API_DESCRIPTION,
  PASSWORD_API_EXAMPLE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '../constants';
import { MaxByteLength } from '../decorators/max-byte-length.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email', type: String })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada', maxLength: NAME_MAX_LENGTH, minLength: 1, type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, NAME_MAX_LENGTH)
  name!: string;

  // @Length держит минимум в символах, @MaxByteLength — максимум в байтах.
  // Верхняя граница @Length избыточна (байт всегда не меньше, чем code units),
  // но оставлена ради понятного сообщения об ошибке для ASCII-паролей.
  @ApiProperty({
    description: PASSWORD_API_DESCRIPTION,
    example: PASSWORD_API_EXAMPLE,
    maxLength: PASSWORD_MAX_BYTES,
    minLength: PASSWORD_MIN_LENGTH,
    type: String,
  })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES)
  @MaxByteLength(PASSWORD_MAX_BYTES)
  password!: string;
}
