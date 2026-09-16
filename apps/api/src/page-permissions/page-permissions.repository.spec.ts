import { describe, expect, it, vi } from 'vitest';
import { PageRole } from './constants';
import {
  type PageAccessChainRow,
  PrismaPagePermissionsRepository,
} from './page-permissions.repository';

const ACTOR = 'actor-id';
const OWNER = 'owner-id';

/**
 * Клиент подменяется целиком: разбор цепочки — самостоятельное правило, и проверять
 * его нужно без базы. Сам подъём проверяет `effective-role.integration-spec.ts`.
 */
function repositoryReturning(chain: PageAccessChainRow[]): PrismaPagePermissionsRepository {
  return new PrismaPagePermissionsRepository({ $queryRaw: vi.fn(async () => chain) } as never);
}

function link(depth: number, role: PageAccessChainRow['role'] = null): PageAccessChainRow {
  return { depth, ownerId: OWNER, role };
}

describe('PrismaPagePermissionsRepository.resolveRole', () => {
  it('даёт owner владельцу независимо от разрешений', async () => {
    const chain = [{ depth: 0, ownerId: ACTOR, role: null } as PageAccessChainRow];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBe(
      PageRole.OWNER,
    );
  });

  it('даёт owner владельцу, даже когда на странице есть прямое разрешение', async () => {
    const chain = [{ depth: 0, ownerId: ACTOR, role: 'VIEWER' } as PageAccessChainRow];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBe(
      PageRole.OWNER,
    );
  });

  it('пустая цепочка означает отсутствие доступа', async () => {
    await expect(repositoryReturning([]).resolveRole(ACTOR, 'page')).resolves.toBeNull();
  });

  it('цепочка без разрешений означает отсутствие доступа', async () => {
    const chain = [link(0), link(1), link(2)];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBeNull();
  });

  it('берёт прямое разрешение самой страницы', async () => {
    const chain = [link(0, 'EDITOR'), link(1, 'VIEWER')];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBe(
      PageRole.EDITOR,
    );
  });

  it('берёт ближайшее разрешение вверх по цепочке', async () => {
    const chain = [link(0), link(1, 'VIEWER'), link(2, 'EDITOR')];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBe(
      PageRole.VIEWER,
    );
  });

  it('унаследованное разрешение действует, когда своего нет', async () => {
    const chain = [link(0), link(1), link(2, 'EDITOR')];

    await expect(repositoryReturning(chain).resolveRole(ACTOR, 'page')).resolves.toBe(
      PageRole.EDITOR,
    );
  });
});
