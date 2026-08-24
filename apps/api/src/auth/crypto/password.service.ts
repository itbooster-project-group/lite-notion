import {
  Inject,
  Injectable,
  InternalServerErrorException,
  type OnModuleInit,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import { exceedsPasswordByteLimit } from '../helpers';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash?: string;

  constructor(@Inject(applicationConfig.KEY) private readonly config: ApplicationConfig) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('lite-notion-dummy-password');
  }

  /**
   * Защитный дубль DTO-проверки для вызовов мимо HTTP-слоя. Здесь именно исключение:
   * молча сохранить хеш от обрезанного пароля хуже, чем упасть, — иначе к учётной
   * записи подходил бы и полный пароль, и его первые 72 байта.
   *
   * Метод async, чтобы это стало отклонением промиса: у метода с типом Promise
   * синхронный throw пролетел бы мимо `.catch()` вызывающего кода.
   */
  async hash(password: string): Promise<string> {
    if (exceedsPasswordByteLimit(password)) {
      throw new InternalServerErrorException('Password exceeds the bcrypt input limit');
    }

    return hash(password, this.config.bcryptRounds);
  }

  /**
   * В отличие от `hash`, здесь возвращается `false`, а не исключение: слишком длинный
   * пароль не может совпасть ни с одним хешем, созданным через `hash`, а бросок на
   * пути входа превратил бы `401` в `500` и сломал бы неразличимость ответа.
   */
  compare(password: string, passwordHash: string): Promise<boolean> {
    if (exceedsPasswordByteLimit(password)) {
      return Promise.resolve(false);
    }

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
