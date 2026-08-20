import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok', type: String })
  status!: 'ok';

  @ApiProperty({ enum: ['up'], example: 'up', type: String })
  database!: 'up';
}
