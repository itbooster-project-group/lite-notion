import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('проверяет соединение простым запросом', async () => {
    const service = new PrismaService(config);
    const query = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ result: 1 }]);

    await service.checkConnection();

    expect(query).toHaveBeenCalledOnce();
    await service.$disconnect();
  });

  it('логирует установленное подключение при старте module lifecycle', async () => {
    const service = new PrismaService(config);
    const check = vi.spyOn(service, 'checkConnection').mockResolvedValue(undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await service.onModuleInit();

    expect(check).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    await service.$disconnect();
  });

  it('логирует предупреждение и не прерывает запуск при недоступной базе', async () => {
    const service = new PrismaService(config);
    vi.spyOn(service, 'checkConnection').mockRejectedValue(
      new Error(`connect ECONNREFUSED for ${config.databaseUrl}`),
    );
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).not.toContain(config.databaseUrl);
    await service.$disconnect();
  });

  it('закрывает Prisma client при завершении module lifecycle', async () => {
    const service = new PrismaService(config);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
