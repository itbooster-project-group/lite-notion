import { describe, expect, it, vi } from 'vitest';

import { type PageAccessChainRow, resolveEffectiveRole } from './effective-role';
import { PageRole } from './roles';

const ACTOR = 'actor-id';
const OWNER = 'owner-id';

/**
 * Клиент подменяется целиком: разбор цепочки — самостоятельное правило, и проверять
 * его нужно без базы. Сам подъём проверяет `effective-role.integration-spec.ts`.
 */
function clientReturning(chain: PageAccessChainRow[]) {
  return { $queryRaw: vi.fn(async () => chain) } as never;
}

function link(depth: number, role: PageAccessChainRow['role'] = null): PageAccessChainRow {
  return { depth, ownerId: OWNER, role };
}

describe('resolveEffectiveRole', () => {
  it('даёт owner владельцу независимо от разрешений', async () => {
    const chain = [{ depth: 0, ownerId: ACTOR, role: null }];

    await expect(resolveEffectiveRole(clientReturning(chain), ACTOR, 'page')).resolves.toBe(
      PageRole.OWNER,
    );
  });

  it('даёт owner владельцу, даже когда на странице есть прямое разрешение', async () => {
    const chain = [{ depth: 0, ownerId: ACTOR, role: 'VIEWER' as const }];

    await expect(resolveEffectiveRole(clientReturning(chain), ACTOR, 'page')).resolves.toBe(
      PageRole.OWNER,
    );
  });

  it('возвращает прямое разрешение на самой странице', async () => {
    await expect(
      resolveEffectiveRole(clientReturning([link(0, 'VIEWER')]), ACTOR, 'page'),
    ).resolves.toBe(PageRole.VIEWER);
  });

  it('наследует разрешение от предка через звенья без разрешений', async () => {
    const chain = [link(0), link(1), link(2, 'EDITOR')];

    await expect(resolveEffectiveRole(clientReturning(chain), ACTOR, 'page')).resolves.toBe(
      PageRole.EDITOR,
    );
  });

  it('предпочитает ближайшее разрешение дальнему, даже когда оно уже', async () => {
    const chain = [link(0, 'VIEWER'), link(1, 'EDITOR')];

    await expect(resolveEffectiveRole(clientReturning(chain), ACTOR, 'page')).resolves.toBe(
      PageRole.VIEWER,
    );
  });

  it('отказывает, когда цепочка оборвана границей restricted без разрешений', async () => {
    // Запрос выше границы не поднимается, поэтому цепочка приходит короткой.
    const chain = [link(0), link(1)];

    await expect(resolveEffectiveRole(clientReturning(chain), ACTOR, 'page')).resolves.toBeNull();
  });

  it('уважает прямое разрешение на restricted-странице', async () => {
    await expect(
      resolveEffectiveRole(clientReturning([link(0), link(1, 'VIEWER')]), ACTOR, 'page'),
    ).resolves.toBe(PageRole.VIEWER);
  });

  it('отказывает на пустой цепочке: страницы нет, она удалена либо удалён её проект', async () => {
    await expect(resolveEffectiveRole(clientReturning([]), ACTOR, 'page')).resolves.toBeNull();
  });
});
