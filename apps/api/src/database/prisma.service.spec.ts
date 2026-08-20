import { describe, expect, it, vi } from 'vitest';

import { NodeEnvironment } from '../config/environment';
import { PrismaService } from './prisma.service';

const config = {
  corsOrigin: 'http://localhost:3000',
  databaseConnectionTimeoutMs: 100,
  databaseUrl: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion',
  nodeEnvironment: NodeEnvironment.Test,
  port: 3001,
};

describe('PrismaService', () => {
  it('проверяет соединение простым запросом', async () => {
    const service = new PrismaService(config);
    const query = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ result: 1 }]);

    await service.checkConnection();

    expect(query).toHaveBeenCalledOnce();
    await service.$disconnect();
  });

  it('закрывает Prisma client при завершении module lifecycle', async () => {
    const service = new PrismaService(config);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
