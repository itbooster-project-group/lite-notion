import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../../config/application-config';
import { TransactionRunner } from '../../database/transaction';
import { PublicationsRepository } from '../publications.repository';
import { DeliverPublicationRevalidationUseCase } from './deliver-publication-revalidation.use-case';

const claimed = {
  attempts: 2,
  id: 'event-id',
  leaseToken: 'lease-token',
  paths: ['/p/example'],
};

function config(timeoutMs = 5_000): ApplicationConfig {
  return {
    publicationRevalidation: {
      token: 'secret-token',
      timeoutMs,
      url: 'https://frontend.example/api/internal/revalidate',
    },
  } as ApplicationConfig;
}

describe('DeliverPublicationRevalidationUseCase', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('claims and commits before HTTP, then acknowledges in a separate bounded transaction', async () => {
    const order: string[] = [];
    const repository = {
      bind: () => repository,
      claimRevalidation: vi.fn(async () => {
        order.push('claim');
        return claimed;
      }),
      acknowledgeRevalidation: vi.fn(async () => {
        order.push('ack');
        return true;
      }),
      rescheduleRevalidation: vi.fn(),
    } as unknown as PublicationsRepository;
    const transactions = {
      run: vi.fn(async (operation: (scope: object) => Promise<unknown>, options?: object) => {
        expect(options).toEqual({ maxWaitMs: 500, timeoutMs: 1_000 });
        const result = await operation({});
        order.push('commit');
        return result;
      }),
    } as unknown as TransactionRunner;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        order.push('http');
        expect(init.method).toBe('POST');
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-token' });
        expect(JSON.parse(String(init.body))).toEqual({
          eventId: 'event-id',
          paths: ['/p/example'],
        });
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return new Response(null, { status: 204 });
      }),
    );

    await new DeliverPublicationRevalidationUseCase(transactions, repository, config()).execute();

    expect(order).toEqual(['claim', 'commit', 'http', 'ack', 'commit']);
    expect(transactions.run).toHaveBeenCalledTimes(2);
    expect(repository.acknowledgeRevalidation).toHaveBeenCalledWith(
      'event-id',
      'lease-token',
      expect.any(Date),
    );
  });

  it('schedules capped exponential retry after a failed remote response', async () => {
    const repository = {
      bind: () => repository,
      claimRevalidation: vi.fn(async () => ({ ...claimed, attempts: 2 })),
      acknowledgeRevalidation: vi.fn(),
      rescheduleRevalidation: vi.fn(async () => true),
    } as unknown as PublicationsRepository;
    const transactions = {
      run: vi.fn((operation: (scope: object) => Promise<unknown>) => operation({})),
    } as unknown as TransactionRunner;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await new DeliverPublicationRevalidationUseCase(transactions, repository, config()).execute();

    const retryCall = vi.mocked(repository.rescheduleRevalidation).mock.calls[0];
    if (!retryCall) throw new Error('Expected retry scheduling');
    const [eventId, token, nextAttemptAt, errorCode] = retryCall;
    expect([eventId, token, errorCode]).toEqual(['event-id', 'lease-token', 'http_503']);
    expect(nextAttemptAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 1_900);
    expect(nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 2_000);
    expect(repository.acknowledgeRevalidation).not.toHaveBeenCalled();
  });

  it('aborts an HTTP delivery at the configured timeout and persists a retry', async () => {
    const repository = {
      bind: () => repository,
      claimRevalidation: vi.fn(async () => claimed),
      acknowledgeRevalidation: vi.fn(),
      rescheduleRevalidation: vi.fn(async () => true),
    } as unknown as PublicationsRepository;
    const transactions = {
      run: vi.fn((operation: (scope: object) => Promise<unknown>) => operation({})),
    } as unknown as TransactionRunner;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'TimeoutError')),
            );
          }),
      ),
    );

    await new DeliverPublicationRevalidationUseCase(transactions, repository, config(1)).execute();

    const retryCall = vi.mocked(repository.rescheduleRevalidation).mock.calls[0];
    if (!retryCall) throw new Error('Expected timed-out delivery to be retried');
    expect(retryCall[3]).toBe('timeout');
    expect(repository.acknowledgeRevalidation).not.toHaveBeenCalled();
  });

  it('redelivers the same idempotent event after remote success and a lost local acknowledgement', async () => {
    let claims = 0;
    const repository = {
      bind: () => repository,
      claimRevalidation: vi.fn(async () => ({
        ...claimed,
        attempts: ++claims,
        leaseToken: claims === 1 ? 'expired-token' : 'replacement-token',
      })),
      acknowledgeRevalidation: vi.fn(async (_id: string, token: string) => {
        if (token === 'expired-token')
          throw new Error('simulated process failure after remote success');
        return true;
      }),
      rescheduleRevalidation: vi.fn(),
    } as unknown as PublicationsRepository;
    const transactions = {
      run: vi.fn((operation: (scope: object) => Promise<unknown>) => operation({})),
    } as unknown as TransactionRunner;
    const requests: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }),
    );
    const useCase = new DeliverPublicationRevalidationUseCase(transactions, repository, config());

    await expect(useCase.execute()).rejects.toThrow('simulated process failure');
    await useCase.execute();

    expect(requests).toEqual([
      { eventId: 'event-id', paths: ['/p/example'] },
      { eventId: 'event-id', paths: ['/p/example'] },
    ]);
    expect(repository.rescheduleRevalidation).not.toHaveBeenCalled();
  });

  it('does not claim or increment attempts without a configured endpoint', async () => {
    const repository = { bind: vi.fn() } as unknown as PublicationsRepository;
    const transactions = { run: vi.fn() } as unknown as TransactionRunner;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new DeliverPublicationRevalidationUseCase(transactions, repository, {
      publicationRevalidation: null,
    } as ApplicationConfig).execute();

    expect(transactions.run).not.toHaveBeenCalled();
    expect(repository.bind).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
