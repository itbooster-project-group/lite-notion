import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { PropsWithChildren } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { type getHealth, useGetHealth } from './generated/health/health';
import type { HealthResponseDto } from './generated/model';
import { server } from './mocks/server';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('generated health client', () => {
  it('получает типизированный success через generated MSW handler', async () => {
    expectTypeOf<Awaited<ReturnType<typeof getHealth>>>().toEqualTypeOf<HealthResponseDto>();

    const { result } = renderHook(() => useGetHealth(), { wrapper: createWrapper() });
    expectTypeOf(result.current.data).toEqualTypeOf<HealthResponseDto | undefined>();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ database: 'up', status: 'ok' });
  });

  it('переводит query в error state при неуспешном HTTP status', async () => {
    server.use(
      http.get('*/api/v1/health', () =>
        HttpResponse.json(
          {
            error: 'Service Unavailable',
            message: 'Database is unavailable',
            path: '/api/v1/health',
            statusCode: 503,
            timestamp: '2026-08-18T12:00:00.000Z',
          },
          { status: 503 },
        ),
      ),
    );

    const { result } = renderHook(() => useGetHealth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toMatchObject({ status: 503 });
  });
});
