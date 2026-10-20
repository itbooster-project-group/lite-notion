import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { DeliverPublicationRevalidationUseCase } from './use-cases/deliver-publication-revalidation.use-case';

@Injectable()
export class PublicationRevalidationScheduler {
  private readonly logger = new Logger(PublicationRevalidationScheduler.name);
  private running = false;
  private warnedDisabled = false;

  constructor(
    @Inject(DeliverPublicationRevalidationUseCase)
    private readonly delivery: DeliverPublicationRevalidationUseCase,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  @Interval(5_000)
  async deliverOne(): Promise<void> {
    if (this.running) return;
    if (!this.config.publicationRevalidation) {
      if (!this.warnedDisabled) {
        this.logger.warn(
          'Publication revalidation endpoint is not configured; outbox delivery is disabled',
        );
        this.warnedDisabled = true;
      }
      return;
    }

    this.running = true;
    try {
      await this.delivery.execute();
    } catch (error) {
      this.logger.warn(
        `Publication revalidation pass failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
