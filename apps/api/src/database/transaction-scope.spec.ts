import { describe, expect, it } from 'vitest';

import { PageDocumentRepository } from '../pages/page-document/page-document.repository';
import { PagesRepository } from '../pages/pages.repository';
import { CreatePageUseCase } from '../pages/use-cases/create-page.use-case';
import { MovePageUseCase } from '../pages/use-cases/move-page.use-case';
import { PurgePageUseCase } from '../pages/use-cases/purge-page.use-case';
import { PurgePagesTrashUseCase } from '../pages/use-cases/purge-pages-trash.use-case';
import { RestorePageUseCase } from '../pages/use-cases/restore-page.use-case';
import { SoftDeletePageUseCase } from '../pages/use-cases/soft-delete-page.use-case';
import { ProjectsRepository } from '../projects/projects.repository';
import { PurgeProjectUseCase } from '../projects/use-cases/purge-project.use-case';
import { PurgeProjectsTrashUseCase } from '../projects/use-cases/purge-projects-trash.use-case';
import { RestoreProjectUseCase } from '../projects/use-cases/restore-project.use-case';
import { SoftDeleteProjectUseCase } from '../projects/use-cases/soft-delete-project.use-case';
import type { TransactionScope } from './transaction';
import { InMemoryTransactionRunner } from './transaction.in-memory';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const RECORD_ID = '22222222-2222-2222-2222-222222222222';

/** Скоупы, с которыми репозиторий привязывали, и имя метода, вызванного мимо `bind`. */
interface Trace {
  boundTo: TransactionScope[];
  unbound: string[];
}

/**
 * Репозиторий, у которого работает только `bind`. Любой другой метод, вызванный на
 * непривязанном экземпляре, попадает в `unbound` — а в проде ушёл бы на соединение
 * из пула, мимо транзакции и мимо блокировки, ничего не сломав заметно.
 *
 * Привязанный экземпляр отвечает на всё пустым результатом, поэтому юзкейс доходит
 * до первого решения и падает доменной ошибкой — этого достаточно: `bind` к этому
 * моменту уже вызван.
 */
function poisoned(trace: Trace): { root: object; bound: object } {
  const bound = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'bind') {
          return () => bound;
        }

        return async () => emptyResultFor(String(property));
      },
    },
  );

  const root = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'bind') {
          return (scope: TransactionScope) => {
            trace.boundTo.push(scope);

            return bound;
          };
        }

        return async () => {
          trace.unbound.push(String(property));

          return emptyResultFor(String(property));
        };
      },
    },
  );

  return { bound, root };
}

/** Пустой ответ любой формы: `null` для чтений, `0` для счётчиков, `[]` для перечней. */
function emptyResultFor(method: string): unknown {
  if (method.startsWith('count')) {
    return 0;
  }

  if (method.startsWith('findSelfDeleted') || method.startsWith('findDeletedIds')) {
    return [];
  }

  if (method.startsWith('mark') || method.startsWith('clear')) {
    return method.startsWith('mark') ? 0 : undefined;
  }

  return null;
}

interface Case {
  name: string;
  /** Сколько репозиториев юзкейс получает — столько же должно быть привязок. */
  repositories: number;
  run: (transactions: InMemoryTransactionRunner, repositories: object[]) => Promise<unknown>;
}

const cases: Case[] = [
  {
    name: 'CreatePageUseCase',
    repositories: 3,
    run: (transactions, [pages, projects, documents]) =>
      new CreatePageUseCase(
        transactions,
        pages as PagesRepository,
        projects as ProjectsRepository,
        documents as PageDocumentRepository,
      ).execute({ ownerId: OWNER_ID, parentPageId: null, projectId: RECORD_ID, title: '' }),
  },
  {
    name: 'MovePageUseCase',
    repositories: 1,
    run: (transactions, [pages]) =>
      new MovePageUseCase(transactions, pages as PagesRepository).execute({
        nextSiblingId: null,
        ownerId: OWNER_ID,
        pageId: RECORD_ID,
        parentPageId: null,
        previousSiblingId: null,
      }),
  },
  {
    name: 'SoftDeletePageUseCase',
    repositories: 1,
    run: (transactions, [pages]) =>
      new SoftDeletePageUseCase(transactions, pages as PagesRepository).execute(
        RECORD_ID,
        OWNER_ID,
      ),
  },
  {
    name: 'RestorePageUseCase',
    repositories: 2,
    run: (transactions, [pages, projects]) =>
      new RestorePageUseCase(
        transactions,
        pages as PagesRepository,
        projects as ProjectsRepository,
      ).execute({ ownerId: OWNER_ID, pageId: RECORD_ID, targetProjectId: null }),
  },
  {
    name: 'PurgePageUseCase',
    repositories: 1,
    run: (transactions, [pages]) =>
      new PurgePageUseCase(transactions, pages as PagesRepository).execute(
        RECORD_ID,
        OWNER_ID,
        false,
      ),
  },
  {
    name: 'PurgePagesTrashUseCase',
    repositories: 1,
    run: (transactions, [pages]) =>
      new PurgePagesTrashUseCase(transactions, pages as PagesRepository).execute(OWNER_ID),
  },
  {
    name: 'SoftDeleteProjectUseCase',
    repositories: 2,
    run: (transactions, [projects, pages]) =>
      new SoftDeleteProjectUseCase(
        transactions,
        projects as ProjectsRepository,
        pages as PagesRepository,
      ).execute(RECORD_ID, OWNER_ID),
  },
  {
    name: 'RestoreProjectUseCase',
    repositories: 2,
    run: (transactions, [projects, pages]) =>
      new RestoreProjectUseCase(
        transactions,
        projects as ProjectsRepository,
        pages as PagesRepository,
      ).execute(RECORD_ID, OWNER_ID),
  },
  {
    name: 'PurgeProjectUseCase',
    repositories: 2,
    run: (transactions, [projects, pages]) =>
      new PurgeProjectUseCase(
        transactions,
        projects as ProjectsRepository,
        pages as PagesRepository,
      ).execute(RECORD_ID, OWNER_ID, false),
  },
  {
    name: 'PurgeProjectsTrashUseCase',
    repositories: 2,
    run: (transactions, [projects, pages]) =>
      new PurgeProjectsTrashUseCase(
        transactions,
        projects as ProjectsRepository,
        pages as PagesRepository,
      ).execute(OWNER_ID, false),
  },
];

/**
 * Каждый юзкейс обязан работать с репозиториями через `bind(scope)` и через один и
 * тот же скоуп. Двойники репозиториев возвращают `this` из `bind`, поэтому забытая
 * привязка на них незаметна — эти тесты и закрывают дыру.
 */
describe('привязка репозиториев к скоупу транзакции', () => {
  for (const testCase of cases) {
    it(`${testCase.name} не обращается к репозиторию мимо bind`, async () => {
      const transactions = new InMemoryTransactionRunner();
      const traces: Trace[] = [];
      const repositories = Array.from({ length: testCase.repositories }, () => {
        const trace: Trace = { boundTo: [], unbound: [] };

        traces.push(trace);

        return poisoned(trace).root;
      });

      await testCase.run(transactions, repositories).catch(() => undefined);

      expect(traces.map((trace) => trace.unbound)).toEqual(traces.map(() => []));
    });

    it(`${testCase.name} привязывает все репозитории к одному скоупу`, async () => {
      const transactions = new InMemoryTransactionRunner();
      const traces: Trace[] = [];
      const repositories = Array.from({ length: testCase.repositories }, () => {
        const trace: Trace = { boundTo: [], unbound: [] };

        traces.push(trace);

        return poisoned(trace).root;
      });

      await testCase.run(transactions, repositories).catch(() => undefined);

      expect(transactions.scopes).toHaveLength(1);

      const scope = transactions.scopes[0];
      const used = new Set(traces.flatMap((trace) => trace.boundTo));

      expect([...used]).toEqual([scope]);
    });
  }
});
