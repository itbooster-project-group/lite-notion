import { randomUUID } from 'node:crypto';

import { normalizeEmail } from '../common/helpers';
import type { UserRecord } from '../users/users.service';
import {
  AuthRepository,
  type CreateSessionInput,
  type DeleteStaleSessionsInput,
  type RegisteredUser,
  type RegisterUserInput,
  type RotateSessionInput,
  type SessionRecord,
} from './auth.repository';
import { EmailAlreadyRegisteredError } from './errors';

/**
 * Тестовая реализация. Воспроизводит наблюдаемый контракт Prisma-версии, включая
 * инвариант «в цепочке не более одной строки с revokedAt = null» (в базе его
 * держит `SELECT ... FOR UPDATE`, здесь — однопоточность JavaScript) и
 * атомарность регистрации: записи фиксируются только после того, как обе
 * вставки прошли.
 */
export class InMemoryAuthRepository extends AuthRepository {
  readonly records = new Map<string, SessionRecord>();

  /** Позволяет тесту уронить вставку сессии, не трогая Prisma. */
  failSessionInsert = false;

  /** Хранилище пользователей передаётся снаружи: тесты читают его же через мок PrismaService. */
  constructor(readonly users: Map<string, UserRecord> = new Map()) {
    super();
  }

  async createUserWithSession(input: RegisterUserInput): Promise<RegisteredUser> {
    const email = normalizeEmail(input.user.email);

    if (this.users.has(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const user: UserRecord = {
      ...input.user,
      createdAt: new Date(),
      email,
      id: randomUUID(),
    };

    if (this.failSessionInsert) {
      throw new Error('session insert failed');
    }

    const session = await this.create({ ...input.session, userId: user.id });

    this.users.set(email, user);

    return { session, user };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const record of this.records.values()) {
      if (record.tokenHash === tokenHash) {
        return { ...record };
      }
    }

    return null;
  }

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      expiresAt: input.expiresAt,
      familyId: input.familyId,
      replacedById: null,
      revokedAt: null,
      tokenHash: input.tokenHash,
      userId: input.userId,
    };

    this.records.set(record.id, record);

    return { ...record };
  }

  async rotate(input: RotateSessionInput): Promise<SessionRecord | null> {
    const { presentedSessionId, ...sessionInput } = input;
    const liveSessions = [...this.records.values()].filter(
      (record) => record.familyId === sessionInput.familyId && record.revokedAt === null,
    );

    if (liveSessions.length === 0) {
      return null;
    }

    const created = await this.create(sessionInput);
    const revokedAt = new Date();

    for (const session of liveSessions) {
      this.records.set(session.id, { ...session, replacedById: created.id, revokedAt });
    }

    const presented = this.records.get(presentedSessionId);

    if (presented !== undefined && presented.replacedById === null) {
      this.records.set(presented.id, { ...presented, replacedById: created.id });
    }

    return { ...created };
  }

  async deleteFamilyBySessionId(sessionId: string): Promise<void> {
    const session = this.records.get(sessionId);

    if (session === undefined) {
      return;
    }

    this.deleteWhere((record) => record.familyId === session.familyId);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    this.deleteWhere((record) => record.userId === userId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    const revokedAt = new Date();

    for (const record of this.records.values()) {
      if (record.familyId === familyId && record.revokedAt === null) {
        this.records.set(record.id, { ...record, revokedAt });
      }
    }
  }

  async deleteStale(input: DeleteStaleSessionsInput): Promise<number> {
    const stale = [...this.records.values()].filter(
      (record) =>
        record.expiresAt.getTime() < input.expiredBefore.getTime() ||
        (record.revokedAt !== null && record.revokedAt.getTime() < input.revokedBefore.getTime()),
    );

    for (const record of stale) {
      this.records.delete(record.id);
    }

    return stale.length;
  }

  liveSessionsOfFamily(familyId: string): SessionRecord[] {
    return [...this.records.values()].filter(
      (record) => record.familyId === familyId && record.revokedAt === null,
    );
  }

  private deleteWhere(matches: (record: SessionRecord) => boolean): void {
    for (const record of [...this.records.values()]) {
      if (matches(record)) {
        this.records.delete(record.id);
      }
    }
  }
}
