import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

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

/**
 * Абстракция вынесена ради тестируемости: ротация — единственное место в проекте
 * с явной транзакцией и `SELECT ... FOR UPDATE`, и держать эту специфику в одном
 * файле дешевле, чем поднимать базу в unit-тестах сервисов.
 */
@Injectable()
export abstract class SessionRepository {
  abstract findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  abstract create(input: CreateSessionInput): Promise<SessionRecord>;
  /** Возвращает `null`, если в цепочке не осталось действующей сессии. */
  abstract rotate(input: RotateSessionInput): Promise<SessionRecord | null>;
  /**
   * Выход: цепочка удаляется целиком. Хранить отозванные строки здесь незачем —
   * их читает только обнаружение повторного использования, а для завершённого
   * пользователем входа расследовать нечего.
   *
   * Область — цепочка, а не одна сессия. Иначе выход по устаревшему access-токену
   * (вторая вкладка, гонка с фоновой ротацией) отзывал бы уже отозванную строку,
   * оставляя действующую голову цепочки живой.
   */
  abstract deleteFamilyBySessionId(sessionId: string): Promise<void>;
  abstract deleteAllForUser(userId: string): Promise<void>;
  /** Обнаружение повторного использования: строки сохраняются как след утечки. */
  abstract revokeFamily(familyId: string): Promise<void>;
  abstract deleteStale(input: DeleteStaleSessionsInput): Promise<number>;
}

@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } });
  }

  create(input: CreateSessionInput): Promise<SessionRecord> {
    return this.prisma.session.create({ data: input });
  }

  /**
   * ИНВАРИАНТ: в одной цепочке ротаций не более одной строки с `revokedAt = null`.
   *
   * Он держится на `FOR UPDATE` ниже. Без блокировки два одновременных обновления
   * одной цепочки прочитают одну и ту же действующую сессию и создадут ей две
   * замены — цепочка получит две живые головы, и обнаружение повторного
   * использования токена перестанет срабатывать, не сломав ни одного теста
   * репозитория. Не выносить ротацию из транзакции и не заменять блокировку
   * оптимистичной проверкой.
   *
   * Отсутствие действующей сессии означает, что цепочка завершена — выходом,
   * выходом со всех устройств или уже сработавшим обнаружением повторного
   * использования. Такую цепочку нельзя оживлять, поэтому возвращается `null`.
   * Проверка обязана оставаться внутри транзакции: снаружи между ней и вставкой
   * появилось бы окно, в котором цепочку успевают отозвать.
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
