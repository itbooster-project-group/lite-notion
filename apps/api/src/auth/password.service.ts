import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import { type ApplicationConfig, applicationConfig } from '../config/application-config';

/**
 * bcrypt молча обрезает вход на 72 байтах, поэтому верхняя граница пароля закреплена
 * здесь и в RegisterDto: иначе пользователь с более длинным паролем получил бы
 * ложное ощущение стойкости.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash?: string;

  constructor(@Inject(applicationConfig.KEY) private readonly config: ApplicationConfig) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('lite-notion-dummy-password');
  }

  hash(password: string): Promise<string> {
    return hash(password, this.config.bcryptRounds);
  }

  compare(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }

  /**
   * Сравнение против фиксированного хеша для случая, когда учётной записи нет.
   * Без него ответ на несуществующий email возвращался бы на порядок быстрее,
   * и разница во времени сама стала бы оракулом существования адреса.
   */
  async compareWithDummy(password: string): Promise<void> {
    const dummyHash = this.dummyHash ?? (await this.hash('lite-notion-dummy-password'));

    this.dummyHash = dummyHash;

    await this.compare(password, dummyHash);
  }
}
