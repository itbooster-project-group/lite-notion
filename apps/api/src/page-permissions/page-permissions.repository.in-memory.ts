import { PageRole } from '@lite-notion/page-permissions';
import { Injectable } from '@nestjs/common';

import type { TransactionScope } from '../database/transaction';
import type { StoredPage } from '../pages/pages.repository.in-memory';
import type { StoredProject } from '../projects/projects.repository.in-memory';
import type {
  AccessiblePageRow,
  PagePermissionRecord,
  UpsertPermissionInput,
} from './page-permissions.repository';
import { PagePermissionsRepository } from './page-permissions.repository';

/** Ключ прямого разрешения — та же пара, что составной PK в базе. */
function grantKey(pageId: string, userId: string): string {
  return `${pageId}:${userId}`;
}

/**
 * Подмена для unit-тестов модулей, которые лишь спрашивают права. Наследование по
 * цепочке она воспроизводит буквально по тем же правилам, но проверяется оно не
 * здесь: подъём — рекурсивный CTE, и его достоверно проверяют интеграционные тесты
 * пакета. Здесь важно только, чтобы владелец, прямое разрешение и граница
 * `restricted` вели себя ожидаемо.
 */
@Injectable()
export class InMemoryPagePermissionsRepository extends PagePermissionsRepository {
  constructor(
    readonly pages: Map<string, StoredPage>,
    readonly projects: Map<string, StoredProject>,
    readonly grants: Map<string, PageRole> = new Map(),
    /** Строки разрешений с полями пользователя: их показывает чтение списка. */
    readonly records: Map<string, PagePermissionRecord> = new Map(),
    readonly users: Map<string, { email: string; name: string }> = new Map(),
  ) {
    super();
  }

  /** Хранилище одно на все скоупы: соединения, которое выбирает `bind`, здесь нет. */
  bind(_scope: TransactionScope): InMemoryPagePermissionsRepository {
    return this;
  }

  grant(pageId: string, userId: string, role: PageRole): void {
    this.grants.set(grantKey(pageId, userId), role);
  }

  revoke(pageId: string, userId: string): void {
    this.grants.delete(grantKey(pageId, userId));
  }

  async resolveRole(userId: string, pageId: string): Promise<PageRole | null> {
    let current = this.livePage(pageId);

    if (current === null) {
      return null;
    }

    if (current.ownerId === userId) {
      return PageRole.OWNER;
    }

    while (current !== null) {
      const granted = this.grants.get(grantKey(current.id, userId));

      if (granted !== undefined) {
        return granted;
      }

      if (current.accessMode === 'RESTRICTED' || current.parentPageId === null) {
        return null;
      }

      current = this.livePage(current.parentPageId);
    }

    return null;
  }

  async findAccessiblePages(userId: string): Promise<AccessiblePageRow[]> {
    const rows: AccessiblePageRow[] = [];

    for (const page of this.pages.values()) {
      if (page.ownerId === userId) {
        continue;
      }

      const role = await this.resolveRole(userId, page.id);

      if (role !== null && role !== PageRole.OWNER) {
        const { deletedAt: _deletedAt, deletedOrigin: _deletedOrigin, ...record } = page;

        rows.push({ ...record, role });
      }
    }

    return rows;
  }

  async upsert(input: UpsertPermissionInput): Promise<PagePermissionRecord> {
    const key = grantKey(input.pageId, input.userId);
    const existing = this.records.get(key);
    const now = new Date();

    const record: PagePermissionRecord = {
      createdAt: existing?.createdAt ?? now,
      email: this.users.get(input.userId)?.email ?? `${input.userId}@example.test`,
      name: this.users.get(input.userId)?.name ?? input.userId,
      pageId: input.pageId,
      role: input.role,
      updatedAt: now,
      userId: input.userId,
    };

    this.records.set(key, record);
    this.grants.set(key, input.role === 'EDITOR' ? PageRole.EDITOR : PageRole.VIEWER);

    return record;
  }

  async remove(pageId: string, userId: string): Promise<boolean> {
    const key = grantKey(pageId, userId);
    const existed = this.records.delete(key);

    this.grants.delete(key);

    return existed;
  }

  async findByPage(pageId: string): Promise<PagePermissionRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.pageId === pageId)
      .sort((left, right) => (left.email < right.email ? -1 : 1));
  }

  async findPageOwner(pageId: string): Promise<string | null> {
    return this.livePage(pageId)?.ownerId ?? null;
  }

  private livePage(pageId: string): StoredPage | null {
    const page = this.pages.get(pageId);

    if (page === undefined || page.deletedAt !== null) {
      return null;
    }

    return this.projects.get(page.projectId)?.deletedAt == null ? page : null;
  }
}
