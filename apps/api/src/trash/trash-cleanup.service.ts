import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TRASH_RETENTION_MS } from '../common/constants';
import { TrashCleanupRepository } from './trash-cleanup.repository';

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);

  constructor(@Inject(TrashCleanupRepository) private readonly trash: TrashCleanupRepository) {}

  /**
   * Задача идемпотентна, поэтому запуск на нескольких инстансах API безвреден:
   * `deleteMany` по одному и тому же условию либо удалит строки, либо не найдёт
   * их. Когда появится Redis, она переедет в BullMQ без изменения поведения.
   *
   * Подтверждения, в отличие от ручного удаления, здесь нет и не нужно: крон
   * трогает только записи старше срока хранения, а всё физически вложенное в
   * просроченную запись просрочено тоже — спрашивать не о чем.
   *
   * Раз в сутки, а не чаще: срок хранения измеряется днями, и более частый
   * запуск не приблизил бы удаление ни на сколько заметное.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeExpiredTrash(): Promise<void> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);

    try {
      const { pages, projects } = await this.trash.purgeExpired(cutoff);

      if (pages > 0 || projects > 0) {
        this.logger.log(`Purged ${projects} expired project(s) and ${pages} expired page(s)`);
      }
    } catch (error) {
      // Недоступная в момент запуска база не должна ронять процесс и не должна
      // мешать следующему запуску по расписанию.
      //
      // В журнал идут тип ошибки и код Prisma, но не её сообщение: оно может
      // нести строку подключения. Без них постоянно падающая очистка —
      // сломанный запрос, разъехавшаяся схема — выглядела бы ровно так же, как
      // временная недоступность базы, и корзина не чистилась бы месяцами при
      // одной и той же успокаивающей строке в логе.
      this.logger.warn(
        `Failed to purge expired trash (${describeFailure(error)}), the next run will retry`,
      );
    }
  }
}

/**
 * Опознавательные признаки отказа без его сообщения: имя класса ошибки и код
 * Prisma, если он есть. Оба безопасны — строку подключения несёт `message`,
 * которое сюда не попадает.
 */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' ? `${error.name}: ${code}` : error.name;
}
