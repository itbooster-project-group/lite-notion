import { PageRole } from '@lite-notion/page-permissions';
import { describe, expect, it, vi } from 'vitest';

import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import type { UsersService } from '../users/users.service';
import type { PagePermissionsRepository } from './page-permissions.repository';
import { PagePermissionsService } from './page-permissions.service';

function serviceResolving(role: PageRole | null): PagePermissionsService {
  return new PagePermissionsService(
    {
      findAccessiblePages: vi.fn(async () => []),
      resolveRole: vi.fn(async () => role),
    } as unknown as PagePermissionsRepository,
    { findByEmail: vi.fn(async () => null) } as unknown as UsersService,
  );
}

describe('PagePermissionsService.requireRole', () => {
  it('возвращает роль, когда её хватает', async () => {
    await expect(
      serviceResolving(PageRole.EDITOR).requireRole('user', 'page', PageRole.VIEWER),
    ).resolves.toBe(PageRole.EDITOR);
  });

  it('возвращает роль, когда она равна требуемой', async () => {
    await expect(
      serviceResolving(PageRole.VIEWER).requireRole('user', 'page', PageRole.VIEWER),
    ).resolves.toBe(PageRole.VIEWER);
  });

  it('пропускает владельца везде', async () => {
    await expect(
      serviceResolving(PageRole.OWNER).requireRole('user', 'page', PageRole.OWNER),
    ).resolves.toBe(PageRole.OWNER);
  });

  it('отказывает `403`, когда страница видна, а роли не хватает', async () => {
    await expect(
      serviceResolving(PageRole.VIEWER).requireRole('user', 'page', PageRole.EDITOR),
    ).rejects.toThrow(PageRoleInsufficientError);
  });

  it('отказывает `404`, когда доступа нет вовсе', async () => {
    await expect(
      serviceResolving(null).requireRole('user', 'page', PageRole.VIEWER),
    ).rejects.toThrow(PageNotFoundError);
  });

  /**
   * Главный инвариант изоляции: отсутствие доступа никогда не должно превращаться в
   * `403`, иначе отказ станет оракулом существования чужих страниц.
   */
  it('никогда не отвечает нехваткой роли при отсутствии доступа', async () => {
    for (const required of [PageRole.VIEWER, PageRole.EDITOR, PageRole.OWNER]) {
      await expect(
        serviceResolving(null).requireRole('user', 'page', required),
      ).rejects.not.toThrow(PageRoleInsufficientError);
    }
  });
});
