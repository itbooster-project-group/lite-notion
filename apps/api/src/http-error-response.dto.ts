import { ApiProperty } from '@nestjs/swagger';

export class HttpErrorResponseDto {
  @ApiProperty({ example: 'Service Unavailable', type: String })
  error!: string;

  @ApiProperty({ example: 'Database is unavailable', type: String })
  message!: string;

  @ApiProperty({ example: '/api/v1/health', type: String })
  path!: string;

  @ApiProperty({ example: 503, type: Number })
  statusCode!: number;

  @ApiProperty({ example: '2026-08-18T12:00:00.000Z', format: 'date-time', type: String })
  timestamp!: string;
}
