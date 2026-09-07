import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TRASH_RETENTION_MS } from '../common/constants';
import { TrashCleanupRepository } from './trash-cleanup.repository';

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);

  constructor(@Inject(TrashCleanupRepository) private readonly trash: TrashCleanupRepository) {}

  /**
   * Задача идемпотентна, поэтому запуск на нескольких инстансах безвреден. С Redis
   * переедет в BullMQ без изменения поведения.
   *
   * Подтверждения нет и не нужно: крон трогает только записи старше срока хранения,
   * а вложенное в просроченную запись просрочено тоже. Раз в сутки — срок в днях.
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
      // Недоступная база не должна ронять процесс и мешать следующему запуску.
      //
      // В журнал идут тип ошибки и код Prisma, но не сообщение: оно может нести
      // строку подключения. Без кода постоянно падающая очистка выглядела бы как
      // временная недоступность базы, и корзина не чистилась бы месяцами.
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
