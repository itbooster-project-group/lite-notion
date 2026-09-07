import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateUserInput, UserRecord } from '../users/users.service';
import { EmailAlreadyRegisteredError } from './errors';
import { isUniqueEmailViolation } from './helpers';

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface CreateSessionInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export interface RotateSessionInput extends CreateSessionInput {
  presentedSessionId: string;
}

export interface DeleteStaleSessionsInput {
  expiredBefore: Date;
  revokedBefore: Date;
}

export interface RegisterUserInput {
  user: CreateUserInput;
  /** `userId` проставляется внутри транзакции, до вставки его ещё не существует. */
  session: Omit<CreateSessionInput, 'userId'>;
}

export interface RegisteredUser {
  user: UserRecord;
  session: SessionRecord;
}

/**
 * Репозиторий модульный, а не на сущность: регистрация пишет в `User` и `Session`
 * одной транзакцией. Транзакции и `FOR UPDATE` живут только здесь — так unit-тесты
 * сервисов обходятся без базы.
 */
@Injectable()
export abstract class AuthRepository {
  /**
   * Создаёт учётную запись и её первую сессию атомарно. Бросает
   * `EmailAlreadyRegisteredError`, если email занят.
   */
  abstract createUserWithSession(input: RegisterUserInput): Promise<RegisteredUser>;
  abstract findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  abstract create(input: CreateSessionInput): Promise<SessionRecord>;
  /** Возвращает `null`, если в цепочке не осталось действующей сессии. */
  abstract rotate(input: RotateSessionInput): Promise<SessionRecord | null>;
  abstract deleteFamilyBySessionId(sessionId: string): Promise<void>;
  abstract deleteAllForUser(userId: string): Promise<void>;
  /** Обнаружение повторного использования: строки сохраняются как след утечки. */
  abstract revokeFamily(familyId: string): Promise<void>;
  abstract deleteStale(input: DeleteStaleSessionsInput): Promise<number>;
}

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async createUserWithSession(input: RegisterUserInput): Promise<RegisteredUser> {
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({ data: input.user });
        const session = await tx.session.create({
          data: { ...input.session, userId: user.id },
        });

        return { session, user };
      });
    } catch (error) {
      // Предварительная проверка email в сервисе — быстрый путь, а не гарантия:
      // между ней и вставкой помещается параллельный запрос. Уникальный индекс
      // разрешает гонку, и его отказ переводится в тот же конфликт, что и проверка.
      if (isUniqueEmailViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }

      throw error;
    }
  }

  findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } });
  }

  create(input: CreateSessionInput): Promise<SessionRecord> {
    return this.prisma.session.create({ data: input });
  }

  /**
   * ИНВАРИАНТ: в цепочке ротаций не более одной строки с `revokedAt = null`.
   *
   * Держится на `FOR UPDATE` ниже: без блокировки два одновременных обновления дадут
   * цепочке две живые головы, и обнаружение повторного использования перестанет
   * срабатывать, не сломав ни одного теста. Не выносить ротацию из транзакции и не
   * заменять блокировку оптимистичной проверкой.
   *
   * `null` — цепочка завершена (выход или уже сработавшее обнаружение), оживлять её
   * нельзя. Проверка остаётся внутри транзакции: снаружи цепочку успевают отозвать.
   */
  rotate(input: RotateSessionInput): Promise<SessionRecord | null> {
    const { presentedSessionId, ...sessionInput } = input;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const lockedLiveSessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Session"
        WHERE "familyId" = ${sessionInput.familyId}::uuid AND "revokedAt" IS NULL
        FOR UPDATE
      `;

      if (lockedLiveSessions.length === 0) {
        return null;
      }

      const created = await tx.session.create({ data: sessionInput });

      await tx.session.updateMany({
        data: { replacedById: created.id, revokedAt: new Date() },
        where: { id: { in: lockedLiveSessions.map((session) => session.id) } },
      });

      // Предъявленная сессия могла быть отозвана ранее — внутри grace-периода это
      // штатный путь. Связываем её с новой только если ссылка ещё пустая, иначе
      // потеряли бы исходную замену и разорвали историю цепочки.
      await tx.session.updateMany({
        data: { replacedById: created.id },
        where: { id: presentedSessionId, replacedById: null },
      });

      return created;
    });
  }

  async deleteFamilyBySessionId(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      select: { familyId: true },
      where: { id: sessionId },
    });

    if (session === null) {
      return;
    }

    await this.prisma.session.deleteMany({ where: { familyId: session.familyId } });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      data: { revokedAt: new Date() },
      where: { familyId, revokedAt: null },
    });
  }

  async deleteStale(input: DeleteStaleSessionsInput): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: input.expiredBefore } },
          { revokedAt: { lt: input.revokedBefore } },
        ],
      },
    });

    return count;
  }
}
