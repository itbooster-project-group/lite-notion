import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import { isPublicationSlugUniqueViolation } from './publication-unique-errors';

function uniqueError(target: unknown, modelName?: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    clientVersion: 'test',
    code: 'P2002',
    meta: { modelName, target },
  });
}

describe('isPublicationSlugUniqueViolation', () => {
  it.each([['slug'], 'slug', 'PagePublication_slug_key'])(
    'matches only the publication slug unique target %j',
    (target) => {
      expect(isPublicationSlugUniqueViolation(uniqueError(target))).toBe(true);
    },
  );

  it.each([['pageId'], ['slug', 'pageId'], 'PagePublication_pageId_key', ['nodeId']])(
    'does not classify another unique target %j as a slug conflict',
    (target) => {
      expect(isPublicationSlugUniqueViolation(uniqueError(target))).toBe(false);
    },
  );

  it('ignores non-unique Prisma errors and unrelated exceptions', () => {
    const foreignKeyError = new Prisma.PrismaClientKnownRequestError('foreign key failed', {
      clientVersion: 'test',
      code: 'P2003',
    });
    expect(isPublicationSlugUniqueViolation(foreignKeyError)).toBe(false);
    expect(isPublicationSlugUniqueViolation(new Error('failure'))).toBe(false);
  });

  it('does not map a slug-like target reported for another model', () => {
    expect(isPublicationSlugUniqueViolation(uniqueError(['slug'], 'AnotherModel'))).toBe(false);
  });

  it('recognizes fields from the Prisma driver adapter metadata', () => {
    const adapterError = new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
      clientVersion: 'test',
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['slug'] } },
        },
        modelName: 'PagePublication',
      },
    });
    const otherAdapterError = new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
      clientVersion: 'test',
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['pageId'] } },
        },
        modelName: 'PagePublication',
      },
    });

    expect(isPublicationSlugUniqueViolation(adapterError)).toBe(true);
    expect(isPublicationSlugUniqueViolation(otherAdapterError)).toBe(false);
  });
});
