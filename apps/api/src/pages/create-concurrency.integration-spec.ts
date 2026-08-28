import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '../generated/prisma/client';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PrismaPagesRepository } from './pages.repository';

/**
 * Гонка, которую нельзя воспроизвести на in-memory репозитории: он однопоточен,
 * поэтому две «параллельные» вставки там сериализуются сами собой.
 *
 * Без advisory-блокировки уровня две транзакции под READ COMMITTED читают одного
 * и того же «последнего брата» и записывают один и тот же ранг. Дубликат сам по
 * себе порядок не ломает, но следующая вставка между такими соседями получает
 * lower == upper и падает внутренней ошибкой.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('конкурентное создание страниц одного уровня', () => {
  let prisma: PrismaClient;
  let repository: PrismaPagesRepository;
  const ownerId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    repository = new PrismaPagesRepository(prisma as unknown as PrismaService);

    await prisma.user.create({
      data: {
        email: `${ownerId}@concurrency.test`,
        id: ownerId,
        name: 'concurrency',
        passwordHash: 'hash',
      },
    });
    await prisma.project.create({ data: { id: projectId, name: 'concurrency', ownerId } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.page.deleteMany({ where: { ownerId } });
  });

  const createPage = (parentPageId: string | null) =>
    repository.create({
      createdById: ownerId,
      ownerId,
      parentPageId,
      projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title: '',
    });

  it('десять параллельных созданий в корне не дают одинаковых рангов', async () => {
    const pages = await Promise.all(Array.from({ length: 10 }, () => createPage(null)));
    const positions = pages.map((page) => page.position);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('десять параллельных созданий под одним родителем не дают одинаковых рангов', async () => {
    const parent = await createPage(null);

    const pages = await Promise.all(Array.from({ length: 10 }, () => createPage(parent.id)));
    const positions = pages.map((page) => page.position);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('после параллельных созданий уровень остаётся строго упорядоченным', async () => {
    await Promise.all(Array.from({ length: 10 }, () => createPage(null)));

    const stored = await prisma.page.findMany({
      orderBy: { position: 'asc' },
      select: { position: true },
      where: { ownerId, parentPageId: null },
    });
    const positions = stored.map((page) => page.position);

    // Строгая монотонность: между любыми соседями остаётся щель для вставки.
    expect(positions).toHaveLength(10);
    expect(positions).toEqual([...positions].sort());
    expect(new Set(positions).size).toBe(positions.length);
  });
});
