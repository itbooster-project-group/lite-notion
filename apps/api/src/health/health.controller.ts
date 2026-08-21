import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { HttpErrorResponseDto } from '../http-error-response.dto';
import { HealthResponseDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Check API and database availability' })
  @ApiOkResponse({
    description: 'API and database are available',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The database is unavailable',
    type: HttpErrorResponseDto,
  })
  getHealth(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }
}
