import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import { PrismaAuthRepository } from './auth.repository';
import { EmailAlreadyRegisteredError } from './errors';

const userInput = { email: 'ada@example.com', name: 'Ada', passwordHash: 'hash' };
const sessionInput = {
  expiresAt: new Date('2026-09-21T12:00:00.000Z'),
  familyId: 'family-id',
  ip: null,
  tokenHash: 'token-hash',
  userAgent: null,
};

function knownRequestError(code: string, target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint failed', {
    clientVersion: 'test',
    code,
    meta: { target },
  });
}

describe('PrismaAuthRepository', () => {
  let transactionClient: {
    user: { create: ReturnType<typeof vi.fn> };
    session: { create: ReturnType<typeof vi.fn> };
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let repository: PrismaAuthRepository;

  beforeEach(() => {
    transactionClient = {
      session: { create: vi.fn(async ({ data }) => ({ ...data, id: 'session-id' })) },
      user: {
        create: vi.fn(async ({ data }) => ({ ...data, createdAt: new Date(), id: 'user-id' })),
      },
    };
    prisma = { $transaction: vi.fn(async (run) => run(transactionClient)) };
    // biome-ignore lint/suspicious/noExplicitAny: узкий тестовый двойник PrismaService
    repository = new PrismaAuthRepository(prisma as any);
  });

  it('выполняет обе вставки внутри одной транзакции', async () => {
    await repository.createUserWithSession({ session: sessionInput, user: userInput });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transactionClient.user.create).toHaveBeenCalledOnce();
    expect(transactionClient.session.create).toHaveBeenCalledOnce();
  });

  it('связывает сессию с созданным пользователем', async () => {
    const created = await repository.createUserWithSession({
      session: sessionInput,
      user: userInput,
    });

    expect(transactionClient.session.create).toHaveBeenCalledWith({
      data: { ...sessionInput, userId: 'user-id' },
    });
    expect(created.user.id).toBe('user-id');
    expect(created.session.id).toBe('session-id');
  });

  it('пробрасывает ошибку вставки сессии, оставляя откат транзакции базе', async () => {
    transactionClient.session.create.mockRejectedValueOnce(new Error('session insert failed'));

    await expect(
      repository.createUserWithSession({ session: sessionInput, user: userInput }),
    ).rejects.toThrow('session insert failed');
  });

  it.each([
    ['массивом колонок', ['email']],
    ['именем индекса', 'User_email_key'],
  ])('переводит P2002 по email, заданный %s, в конфликт', async (_case, target) => {
    transactionClient.user.create.mockRejectedValueOnce(knownRequestError('P2002', target));

    await expect(
      repository.createUserWithSession({ session: sessionInput, user: userInput }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('не выдаёт конфликт email за нарушение уникальности другой колонки', async () => {
    transactionClient.session.create.mockRejectedValueOnce(
      knownRequestError('P2002', ['tokenHash']),
    );

    await expect(
      repository.createUserWithSession({ session: sessionInput, user: userInput }),
    ).rejects.not.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('не перехватывает другие коды Prisma', async () => {
    transactionClient.user.create.mockRejectedValueOnce(knownRequestError('P2003', ['email']));

    await expect(
      repository.createUserWithSession({ session: sessionInput, user: userInput }),
    ).rejects.not.toBeInstanceOf(EmailAlreadyRegisteredError);
  });
});
