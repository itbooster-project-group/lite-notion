import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { normalizeEmail } from '../common/helpers';
import { type UserRecord, UsersService } from '../users/users.service';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, INVALID_CREDENTIALS_MESSAGE } from './constants';
import { PasswordService } from './crypto/password.service';
import { EmailAlreadyRegisteredError } from './errors';
import { type IssuedSession, type SessionOrigin, SessionService } from './session/session.service';

export interface RegisterInput {
  email: string;
  name: string;
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

    // Быстрый путь: отвечает конфликтом, не доводя дело до уникального индекса.
    // Гарантией он не является — параллельный запрос помещается между проверкой
    // и вставкой, поэтому ниже отдельно разбирается отказ самого индекса.
    if ((await this.users.findByEmail(email)) !== null) {
      throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
    }

    const passwordHash = await this.passwords.hash(input.password);

    try {
      return await this.sessions.issueForNewUser({ email, name: input.name, passwordHash }, origin);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
      }

      throw error;
    }
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
}
