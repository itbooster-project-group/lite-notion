import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../config/application-config';
import { PublicationRevalidationScheduler } from './publication-revalidation.scheduler';
import { DeliverPublicationRevalidationUseCase } from './use-cases/deliver-publication-revalidation.use-case';

describe('PublicationRevalidationScheduler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not claim outbox rows without an endpoint and logs disabled integration once', async () => {
    const delivery = { execute: vi.fn() } as unknown as DeliverPublicationRevalidationUseCase;
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const scheduler = new PublicationRevalidationScheduler(delivery, {
      publicationRevalidation: null,
    } as ApplicationConfig);

    await scheduler.deliverOne();
    await scheduler.deliverOne();

    expect(delivery.execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Publication revalidation endpoint is not configured; outbox delivery is disabled',
    );
  });

  it('does not overlap delivery passes within one API process', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delivery = {
      execute: vi.fn(async () => gate),
    } as unknown as DeliverPublicationRevalidationUseCase;
    const scheduler = new PublicationRevalidationScheduler(delivery, {
      publicationRevalidation: {
        token: 'token',
        timeoutMs: 5_000,
        url: 'https://frontend.example/api/internal/revalidate',
      },
    } as ApplicationConfig);

    const first = scheduler.deliverOne();
    await scheduler.deliverOne();
    release();
    await first;

    expect(delivery.execute).toHaveBeenCalledTimes(1);
  });
});
