import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('делегирует health-проверку сервису', async () => {
    const getHealth = vi.fn(async () => ({ database: 'up' as const, status: 'ok' as const }));
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { getHealth } }],
    }).compile();

    await expect(moduleRef.get(HealthController).getHealth()).resolves.toEqual({
      database: 'up',
      status: 'ok',
    });
    expect(getHealth).toHaveBeenCalledOnce();
  });
});
