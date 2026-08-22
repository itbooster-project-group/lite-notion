import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { normalizeEmail, type UserRecord, UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { type IssuedSession, type SessionOrigin, SessionService } from './session.service';

/**
 * Единственное сообщение для обеих причин отказа. Разные тексты позволили бы
 * перебором выяснить, какие адреса зарегистрированы.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

export interface RegisterInput {
  email: string;
  nickname: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedResult {
  session: IssuedSession;
  user: UserRecord;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async register(input: RegisterInput, origin: SessionOrigin): Promise<AuthenticatedResult> {
    const email = normalizeEmail(input.email);

    if ((await this.users.findByEmail(email)) !== null) {
      throw new ConflictException('Email is already registered');
    }

    const user = await this.users.create({
      email,
      nickname: input.nickname,
      passwordHash: await this.passwords.hash(input.password),
    });

    return { session: await this.sessions.issue(user.id, origin), user };
  }

  async login(input: LoginInput, origin: SessionOrigin): Promise<AuthenticatedResult> {
    const user = await this.users.findByEmail(input.email);

    if (user === null) {
      // Сравнение выполняется и без учётной записи: пропустив его, мы вернули бы
      // ответ на порядок быстрее, и разница во времени сама выдавала бы,
      // зарегистрирован ли адрес.
      await this.passwords.compareWithDummy(input.password);

      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!(await this.passwords.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return { session: await this.sessions.issue(user.id, origin), user };
  }

  rotate(refreshToken: string, origin: SessionOrigin): Promise<IssuedSession> {
    return this.sessions.rotate(refreshToken, origin);
  }

  logout(sessionId: string): Promise<void> {
    return this.sessions.logout(sessionId);
  }

  logoutEverywhere(userId: string): Promise<void> {
    return this.sessions.logoutEverywhere(userId);
  }
}
