import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../common/helpers';
import { PASSWORD_API_DESCRIPTION, PASSWORD_API_EXAMPLE, PASSWORD_MAX_BYTES } from '../constants';
import { MaxByteLength } from '../decorators/max-byte-length.decorator';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com', format: 'email', type: String })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: PASSWORD_API_DESCRIPTION,
    example: PASSWORD_API_EXAMPLE,
    type: String,
  })
  @IsString()
  @MaxLength(PASSWORD_MAX_BYTES)
  @MaxByteLength(PASSWORD_MAX_BYTES)
  password!: string;
}
