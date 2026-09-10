import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service';
import { PagePermissionsModule } from './page-permissions.module';
import { PagePermissionsRepository } from './page-permissions.repository';
import { PagePermissionsService } from './page-permissions.service';

/**
 * Модуль обязан подниматься сам по себе: он лежит ниже `PagesModule` в графе, и
 * появление обратной зависимости — с `forwardRef` или без — сломает этот тест.
 */
describe('PagePermissionsModule', () => {
  it('поднимается без PagesModule и отдаёт сервис и репозиторий', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PagePermissionsModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(async () => []) })
      .compile();

    expect(moduleRef.get(PagePermissionsService)).toBeInstanceOf(PagePermissionsService);
    expect(moduleRef.get(PagePermissionsRepository)).toBeDefined();

    await moduleRef.close();
  });
});
