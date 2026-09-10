import { describe, expect, it, vi } from 'vitest';

import { PageAccessDeniedError, PageAccessService } from './page-access.js';

describe('PageAccessService', () => {
  it('разрешает owner access к live page с документом', async () => {
    const page = { findFirst: vi.fn(async () => ({ id: 'page-id' })) };
    const service = new PageAccessService({ page } as never);

    await expect(service.authorize('user-id', 'page-id')).resolves.toEqual({
      canRead: true,
      canWrite: true,
      pageId: 'page-id',
      userId: 'user-id',
    });
    expect(page.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        deletedAt: null,
        document: { isNot: null },
        id: 'page-id',
        ownerId: 'user-id',
      },
    });
  });

  it('одинаково отклоняет missing, foreign, deleted или missing document page', async () => {
    const service = new PageAccessService({
      page: { findFirst: vi.fn(async () => null) },
    } as never);

    await expect(service.authorize('user-id', 'page-id')).rejects.toThrow(PageAccessDeniedError);
  });
});
