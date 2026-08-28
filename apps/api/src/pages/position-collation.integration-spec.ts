import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { positionBetween } from './helpers';

/**
 * Единственное свойство fractional rank, которое нельзя проверить без базы:
 * `ORDER BY position` в PostgreSQL обязан давать тот же порядок, что сравнение
 * по code units в приложении. Держит его collation `"C"` у колонки — свойство
 * схемы, а не кода, поэтому юнит-тесты его не видят.
 *
 * Требует поднятую базу и применённые миграции:
 *   pnpm db:up && pnpm --filter @lite-notion/api db:migrate:deploy
 *   pnpm --filter @lite-notion/api test:integration
 */
describe('порядок fractional rank в PostgreSQL', () => {
  let client: Client;
  const ownerId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    await client.query(
      'INSERT INTO "User"("id","email","name","passwordHash","updatedAt") VALUES ($1,$2,$3,$4,now())',
      [ownerId, `${ownerId}@collation.test`, 'collation', 'hash'],
    );
    await client.query('INSERT INTO "Project"("id","ownerId","name") VALUES ($1,$2,$3)', [
      projectId,
      ownerId,
      'collation',
    ]);
  });

  afterAll(async () => {
    // Каскад удаляет проект, страницы и документы.
    await client.query('DELETE FROM "User" WHERE "id" = $1', [ownerId]);
    await client.end();
  });

  const insertPages = async (positions: string[]): Promise<void> => {
    for (const position of positions) {
      await client.query(
        `INSERT INTO "Page"("id","ownerId","projectId","createdById","title","position","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,now())`,
        [randomUUID(), ownerId, projectId, ownerId, '', position],
      );
    }
  };

  const readOrdered = async (): Promise<string[]> => {
    const { rows } = await client.query<{ position: string }>(
      'SELECT "position" FROM "Page" WHERE "ownerId" = $1 ORDER BY "position" ASC',
      [ownerId],
    );

    return rows.map((row) => row.position);
  };

  const clearPages = () => client.query('DELETE FROM "Page" WHERE "ownerId" = $1', [ownerId]);

  it('колонка position объявлена с collation "C"', async () => {
    const { rows } = await client.query<{ collation: string | null }>(
      `SELECT attcollation::regcollation::text AS collation
       FROM pg_attribute
       WHERE attrelid = '"Page"'::regclass AND attname = 'position'`,
    );

    expect(rows[0]?.collation).toBe('"C"');
  });

  it('порядок в базе совпадает с порядком по code units на смешанном регистре', async () => {
    // 'V' и 'l' — ранги первых двух страниц уровня. В en_US.UTF-8 они
    // сравниваются алфавитно и меняются местами относительно порядка кодов.
    const positions = ['0', '9', 'A', 'V', 'Z', 'a', 'l', 'z', 'aV', 'zV', 'G', '8'];
    await clearPages();
    await insertPages(positions);

    expect(await readOrdered()).toEqual([...positions].sort());
  });

  it('«последний брат» из базы совпадает с максимумом по code units', async () => {
    const positions = ['V', 'l'];
    await clearPages();
    await insertPages(positions);

    const { rows } = await client.query<{ position: string }>(
      'SELECT "position" FROM "Page" WHERE "ownerId" = $1 ORDER BY "position" DESC LIMIT 1',
      [ownerId],
    );

    expect(rows[0]?.position).toBe('l');
  });

  it('последовательное добавление в конец сохраняет порядок и не даёт дубликатов', async () => {
    await clearPages();
    const positions: string[] = [];

    for (let index = 0; index < 20; index += 1) {
      const { rows } = await client.query<{ position: string }>(
        'SELECT "position" FROM "Page" WHERE "ownerId" = $1 ORDER BY "position" DESC LIMIT 1',
        [ownerId],
      );
      const next = positionBetween(rows[0]?.position ?? null, null);

      positions.push(next);
      await insertPages([next]);
    }

    expect(new Set(positions).size).toBe(positions.length);
    expect(await readOrdered()).toEqual(positions);
  });
});
