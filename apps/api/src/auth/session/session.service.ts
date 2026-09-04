import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import type { CreateUserInput, UserRecord } from '../../users/users.service';
import { AuthRepository, type SessionRecord } from '../auth.repository';
import { REFRESH_GRACE_PERIOD_MS } from '../constants';
import { TokenService } from '../crypto/token.service';

export interface SessionOrigin {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  /** Новый вход: новая цепочка ротаций, не связанная с уже открытыми устройствами. */
  async issue(userId: string, origin: SessionOrigin): Promise<IssuedSession> {
    const refreshToken = this.tokens.generateRefreshToken();
    const session = await this.repository.create({
      expiresAt: this.nextExpiry(),
      familyId: randomUUID(),
      ip: origin.ip,
      tokenHash: this.tokens.hashRefreshToken(refreshToken),
      userAgent: origin.userAgent,
      userId,
    });

    return this.toIssuedSession(session, refreshToken);
  }

  /**
   * Регистрация: учётная запись и её первая сессия создаются одной транзакцией для соблюдения атомарности
   */
  async issueForNewUser(
    user: CreateUserInput,
    origin: SessionOrigin,
  ): Promise<{ session: IssuedSession; user: UserRecord }> {
    const refreshToken = this.tokens.generateRefreshToken();
    const created = await this.repository.createUserWithSession({
      session: {
        expiresAt: this.nextExpiry(),
        familyId: randomUUID(),
        ip: origin.ip,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: origin.userAgent,
      },
      user,
    });

    return {
      session: await this.toIssuedSession(created.session, refreshToken),
      user: created.user,
    };
  }

  async rotate(refreshToken: string, origin: SessionOrigin): Promise<IssuedSession> {
    const presented = await this.repository.findByTokenHash(
      this.tokens.hashRefreshToken(refreshToken),
    );

    if (presented === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (presented.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (this.isReuse(presented)) {
      // Токен предъявлен позже grace-периода, а цепочка уже ротирована — значит
      // копия токена есть у кого-то ещё. Отзываем цепочку целиком, включая
      // действующую голову, и заставляем владельца войти заново.
      await this.repository.revokeFamily(presented.familyId);

      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRefreshToken = this.tokens.generateRefreshToken();
    const created = await this.repository.rotate({
      expiresAt: this.nextExpiry(),
      familyId: presented.familyId,
      ip: origin.ip,
      presentedSessionId: presented.id,
      tokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
      userAgent: origin.userAgent,
      userId: presented.userId,
    });

    // Цепочка завершена — grace-период не должен её оживлять: отозванная голова
    // попадала бы в собственное окно и продолжала выдавать токены.
    if (created === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.toIssuedSession(created, nextRefreshToken);
  }

  /** Удаляет цепочку целиком, а не одну сессию: см. комментарий в `AuthRepository`. */
  logout(sessionId: string): Promise<void> {
    return this.repository.deleteFamilyBySessionId(sessionId);
  }

  logoutEverywhere(userId: string): Promise<void> {
    return this.repository.deleteAllForUser(userId);
  }

  private isReuse(session: SessionRecord): boolean {
    return (
      session.revokedAt !== null &&
      Date.now() - session.revokedAt.getTime() > REFRESH_GRACE_PERIOD_MS
    );
  }

  private nextExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlS * 1000);
  }

  private async toIssuedSession(
    session: SessionRecord,
    refreshToken: string,
  ): Promise<IssuedSession> {
    return {
      accessToken: await this.tokens.signAccessToken({ sid: session.id, sub: session.userId }),
      expiresIn: this.config.accessTokenTtlS,
      refreshToken,
      sessionId: session.id,
    };
  }
}
