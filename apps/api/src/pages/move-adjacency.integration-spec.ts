import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaService } from '../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../database/transaction';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaProjectsRepository } from '../projects/projects.repository';
import { SiblingsNotAdjacentError } from './errors';
import { PrismaPageDocumentRepository } from './page-document/page-document.repository';
import { PrismaPagesRepository } from './pages.repository';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';

/**
 * Смежность соседей считает запрос с `IS NOT DISTINCT FROM` и сравнением пары
 * `(position, id)`. Порядок рангов держит collation `"C"` у колонки — свойство
 * схемы, которого двойник не воспроизводит.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('смежность соседей при перемещении на живой базе', () => {
  let prisma: PrismaClient;
  let createPage: CreatePageUseCase;
  let movePage: MovePageUseCase;
  const ownerId = randomUUID();
  let projectId: string;

  const add = (title: string) =>
    createPage.execute({ ownerId, parentPageId: null, projectId, title });

  const move = (pageId: string, previousSiblingId: string | null, nextSiblingId: string | null) =>
    movePage.execute({ nextSiblingId, ownerId, pageId, parentPageId: null, previousSiblingId });

  const order = async () =>
    (
      await prisma.page.findMany({
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { title: true },
        where: { deletedAt: null, ownerId },
      })
    ).map((row) => row.title);

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

    const client = prisma as unknown as DatabaseClient;
    const transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    const pages = new PrismaPagesRepository(client);

    createPage = new CreatePageUseCase(
      transactions,
      pages,
      new PrismaProjectsRepository(client),
      new PrismaPageDocumentRepository(client),
    );
    movePage = new MovePageUseCase(transactions, pages);

    await prisma.user.create({
      data: { email: `${ownerId}@adjacency.test`, id: ownerId, name: 'adj', passwordHash: 'hash' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await prisma.project.create({ data: { name: 'adj', ownerId } })).id;
  });

  it('отклоняет пару, между которой стоит третий брат, и не трогает дерево', async () => {
    const first = await add('first');
    await add('second');
    const third = await add('third');
    const moved = await add('moved');
    const before = await order();

    await expect(move(moved.id, first.id, third.id)).rejects.toBeInstanceOf(
      SiblingsNotAdjacentError,
    );

    await expect(order()).resolves.toEqual(before);
  });

  it('пропускает смежную пару и ставит страницу ровно между ними', async () => {
    const first = await add('first');
    const second = await add('second');
    const moved = await add('moved');

    await move(moved.id, first.id, second.id);

    await expect(order()).resolves.toEqual(['first', 'moved', 'second']);
  });

  it('не считает перемещаемую страницу помехой между её будущими соседями', async () => {
    const first = await add('first');
    const moved = await add('moved');
    const third = await add('third');

    await expect(move(moved.id, first.id, third.id)).resolves.toMatchObject({ id: moved.id });
    await expect(order()).resolves.toEqual(['first', 'moved', 'third']);
  });

  it('считает щель на корневом уровне, где parentPageId равен NULL', async () => {
    const first = await add('first');
    await add('second');
    const third = await add('third');
    const child = await createPage.execute({
      ownerId,
      parentPageId: first.id,
      projectId,
      title: 'child',
    });

    // Ребёнок лежит на другом уровне и в щель корневого уровня попадать не должен.
    await expect(move(child.id, first.id, third.id)).rejects.toBeInstanceOf(
      SiblingsNotAdjacentError,
    );
  });
});
