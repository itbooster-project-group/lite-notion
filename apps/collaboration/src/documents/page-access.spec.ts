import { describe, expect, it, vi } from 'vitest';

import { PageAccessDeniedError, PageAccessService } from './page-access.js';

/**
 * Цепочку подменяем на уровне запроса: правила подъёма — забота общего пакета и его
 * интеграционных тестов, здесь проверяется только перевод роли в право записи.
 */
function serviceFor(options: {
  chain?: { ownerId: string; depth: number; role: 'VIEWER' | 'EDITOR' | null }[];
  hasDocument?: boolean;
}) {
  const prisma = {
    $queryRaw: vi.fn(async () => options.chain ?? []),
    pageDocument: {
      findUnique: vi.fn(async () => (options.hasDocument === false ? null : { pageId: 'page-id' })),
    },
  };

  return { prisma, service: new PageAccessService(prisma as never) };
}

const OWNER = 'owner-id';
const ACTOR = 'actor-id';

describe('PageAccessService', () => {
  it('даёт владельцу чтение и запись', async () => {
    const { service } = serviceFor({ chain: [{ depth: 0, ownerId: OWNER, role: null }] });

    await expect(service.authorize(OWNER, 'page-id')).resolves.toEqual({
      canRead: true,
      canWrite: true,
      pageId: 'page-id',
      userId: OWNER,
    });
  });

  it('даёт редактору чтение и запись', async () => {
    const { service } = serviceFor({ chain: [{ depth: 0, ownerId: OWNER, role: 'EDITOR' }] });

    await expect(service.authorize(ACTOR, 'page-id')).resolves.toMatchObject({
      canRead: true,
      canWrite: true,
    });
  });

  it('даёт читателю чтение без записи', async () => {
    const { service } = serviceFor({ chain: [{ depth: 0, ownerId: OWNER, role: 'VIEWER' }] });

    await expect(service.authorize(ACTOR, 'page-id')).resolves.toMatchObject({
      canRead: true,
      canWrite: false,
    });
  });

  it('пускает по унаследованному разрешению с предка', async () => {
    const { service } = serviceFor({
      chain: [
        { depth: 0, ownerId: OWNER, role: null },
        { depth: 1, ownerId: OWNER, role: 'EDITOR' },
      ],
    });

    await expect(service.authorize(ACTOR, 'page-id')).resolves.toMatchObject({ canWrite: true });
  });

  it('одинаково отклоняет отсутствие доступа, удаление и границу restricted', async () => {
    // Пустая цепочка приходит и для несуществующей страницы, и для удалённой, и для
    // страницы удалённого проекта; оборванная — для границы restricted.
    for (const chain of [[], [{ depth: 0, ownerId: OWNER, role: null }]]) {
      const { service } = serviceFor({ chain });

      await expect(service.authorize(ACTOR, 'page-id')).rejects.toThrow(PageAccessDeniedError);
    }
  });

  it('отклоняет страницу без документа даже её владельцу', async () => {
    const { service } = serviceFor({
      chain: [{ depth: 0, ownerId: OWNER, role: null }],
      hasDocument: false,
    });

    await expect(service.authorize(OWNER, 'page-id')).rejects.toThrow(PageAccessDeniedError);
  });

  it('не спрашивает владельца страницы отдельным запросом', async () => {
    const { prisma, service } = serviceFor({ chain: [{ depth: 0, ownerId: OWNER, role: null }] });

    await service.authorize(OWNER, 'page-id');

    // Собственного правила доступа здесь не осталось: роль приходит из пакета.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
