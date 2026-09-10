import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { ACCESS_MODES, type AccessModeValue } from '../constants';

export class SetAccessModeDto {
  @ApiProperty({
    description:
      'Where permission inheritance stops. `restricted` blocks inheritance through this page; a grant on the page itself still applies.',
    enum: ACCESS_MODES,
    example: 'restricted',
  })
  @IsIn(ACCESS_MODES)
  accessMode!: AccessModeValue;
}
