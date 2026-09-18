import { describe, expect, it, vi } from 'vitest';

import { ApiDeniedError, ApiUnavailableError } from '../api/internal-api-client.js';
import { PageAccessDeniedError, PageAccessService } from './page-access.js';

const PAGE = 'page-id';
const ACTOR = 'actor-id';

function serviceWith(authorizePage: ReturnType<typeof vi.fn>) {
  return new PageAccessService({ authorizePage } as never);
}

describe('PageAccessService', () => {
  it('переносит право записи из вердикта API', async () => {
    const service = serviceWith(
      vi.fn(async () => ({ canWrite: true, pageId: PAGE, role: 'editor', userId: ACTOR })),
    );

    await expect(service.authorize('token', PAGE)).resolves.toEqual({
      canRead: true,
      canWrite: true,
      pageId: PAGE,
      userId: ACTOR,
    });
  });

  it('читателю даёт чтение без записи', async () => {
    const service = serviceWith(
      vi.fn(async () => ({ canWrite: false, pageId: PAGE, role: 'viewer', userId: ACTOR })),
    );

    await expect(service.authorize('token', PAGE)).resolves.toMatchObject({
      canRead: true,
      canWrite: false,
    });
  });

  it('пробрасывает токен клиента без изменений', async () => {
    const authorizePage = vi.fn(async () => ({
      canWrite: true,
      pageId: PAGE,
      role: 'editor',
      userId: ACTOR,
    }));

    await serviceWith(authorizePage).authorize('client-token', PAGE);

    expect(authorizePage).toHaveBeenCalledWith('client-token', PAGE);
  });

  it('переводит авторитетный отказ в отказ доступа', async () => {
    const service = serviceWith(
      vi.fn(async () => {
        throw new ApiDeniedError(404);
      }),
    );

    await expect(service.authorize('token', PAGE)).rejects.toBeInstanceOf(PageAccessDeniedError);
  });

  it('недоступность API отказом не считает', async () => {
    const service = serviceWith(
      vi.fn(async () => {
        throw new ApiUnavailableError('timeout');
      }),
    );

    await expect(service.authorize('token', PAGE)).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
