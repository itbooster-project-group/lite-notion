import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthRepository } from '../auth.repository';
import { REVOKED_SESSION_RETENTION_MS } from '../constants';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(@Inject(AuthRepository) private readonly sessions: AuthRepository) {}

  /**
   * Задача идемпотентна, поэтому запуск на нескольких инстансах API безвреден.
   * Когда появится Redis, она переедет в BullMQ без изменения поведения.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async removeStaleSessions(): Promise<void> {
    const now = Date.now();

    try {
      const removed = await this.sessions.deleteStale({
        expiredBefore: new Date(now),
        revokedBefore: new Date(now - REVOKED_SESSION_RETENTION_MS),
      });

      if (removed > 0) {
        this.logger.log(`Removed ${removed} stale session(s)`);
      }
    } catch {
      // Недоступная в момент запуска база не должна ронять процесс и не должна
      // мешать следующему запуску по расписанию.
      this.logger.warn('Failed to remove stale sessions, the next run will retry');
    }
  }
}
