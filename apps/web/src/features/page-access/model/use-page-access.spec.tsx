import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePageAccess } from './use-page-access';

const api = vi.hoisted(() => ({
  getGetPagePermissionsQueryKey: (pageId: string) => ['permissions', pageId],
  getGetPageQueryKey: (pageId: string) => ['page', pageId],
  getGetPageTreeQueryKey: () => ['page-tree'],
  useGetPagePermissions: () => ({ data: [] }),
  useGrantPagePermission: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRevokePagePermission: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSetPageAccessMode: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({ id: 'page-1', accessMode: 'restricted' }),
  }),
}));

vi.mock('@/shared/api', () => api);

function Harness() {
  const access = usePageAccess('page-1');
  return (
    <button onClick={() => void access.setAccessMode('restricted')} type="button">
      Change mode
    </button>
  );
}

describe('usePageAccess query coordination', () => {
  it('updates active page cache and invalidates only the page tree after access-mode mutation', async () => {
    const queryClient = new QueryClient();
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change mode' }));

    await waitFor(() => {
      expect(setQueryData).toHaveBeenCalledWith(['page', 'page-1'], {
        id: 'page-1',
        accessMode: 'restricted',
      });
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page-tree'] });
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
