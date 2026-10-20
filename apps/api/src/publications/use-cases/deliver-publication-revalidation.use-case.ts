import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import { TransactionRunner } from '../../database/transaction';
import { PublicationsRepository } from '../publications.repository';

const LEASE_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 500;
const TRANSACTION_TIMEOUT_MS = 1_000;
const DELIVERY_ATTEMPT_DEADLINE_MS = 10_000;
const FINAL_TRANSACTION_BUDGET_MS = TRANSACTION_MAX_WAIT_MS + TRANSACTION_TIMEOUT_MS;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

@Injectable()
export class DeliverPublicationRevalidationUseCase {
  private readonly logger = new Logger(DeliverPublicationRevalidationUseCase.name);

  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  async execute(): Promise<void> {
    const delivery = this.config.publicationRevalidation;
    if (!delivery) return;

    const claimed = await this.transactions.run(
      (scope) => this.publications.bind(scope).claimRevalidation(randomUUID(), LEASE_MS),
      { maxWaitMs: TRANSACTION_MAX_WAIT_MS, timeoutMs: TRANSACTION_TIMEOUT_MS },
    );
    if (!claimed) return;

    let errorCode: string | null = null;
    try {
      const httpTimeoutMs = Math.min(
        delivery.timeoutMs,
        DELIVERY_ATTEMPT_DEADLINE_MS - FINAL_TRANSACTION_BUDGET_MS,
      );
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${delivery.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventId: claimed.id, paths: claimed.paths }),
        signal: AbortSignal.timeout(httpTimeoutMs),
      });
      if (!response.ok) errorCode = `http_${response.status}`;
    } catch (error) {
      errorCode =
        error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'delivery_error';
    }

    if (errorCode === null) {
      const deliveredAt = new Date();
      await this.transactions.run(
        (scope) =>
          this.publications
            .bind(scope)
            .acknowledgeRevalidation(claimed.id, claimed.leaseToken, deliveredAt),
        { maxWaitMs: TRANSACTION_MAX_WAIT_MS, timeoutMs: TRANSACTION_TIMEOUT_MS },
      );
      return;
    }

    const retryMs = Math.min(1_000 * 2 ** Math.min(claimed.attempts - 1, 20), MAX_RETRY_DELAY_MS);
    const finishedAt = new Date();
    const rescheduled = await this.transactions.run(
      (scope) =>
        this.publications
          .bind(scope)
          .rescheduleRevalidation(
            claimed.id,
            claimed.leaseToken,
            new Date(finishedAt.getTime() + retryMs),
            errorCode as string,
          ),
      { maxWaitMs: TRANSACTION_MAX_WAIT_MS, timeoutMs: TRANSACTION_TIMEOUT_MS },
    );
    if (rescheduled) {
      this.logger.warn(`Publication revalidation delivery failed (${errorCode}); retry scheduled`);
    }
  }
}
