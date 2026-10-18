import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { AssetGcUseCases } from './asset-gc.use-cases';

@Injectable()
export class AssetGcScheduler {
  private readonly logger = new Logger(AssetGcScheduler.name);
  private running = false;

  constructor(
    @Inject(AssetGcUseCases) private readonly assets: AssetGcUseCases,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  @Interval(60_000)
  async cleanup(): Promise<void> {
    if (!this.config.assets.gcEnabled || this.running) return;
    this.running = true;
    try {
      await this.assets.cleanupExpiredPendingAssets();
      await this.assets.reconcileDeletedAssets();
      await this.assets.cleanupOrphanedObjects();
    } catch (error) {
      this.logger.warn(
        `Asset cleanup pass failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
