import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PrivateLayout } from './private-layout';

vi.mock('@/app/routing', () => ({
  PrivateRoute: ({ children }: { children: ReactNode }) => (
    <div data-testid="private-route">{children}</div>
  ),
}));

vi.mock('@/features/workspace-management', () => ({
  WorkspaceDeleteCleanupProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="delete-cleanup-provider">{children}</div>
  ),
}));

vi.mock('./private-workspace', () => ({
  PrivateWorkspace: ({ children }: { children: ReactNode }) => (
    <div data-testid="private-workspace">{children}</div>
  ),
}));

describe('PrivateLayout', () => {
  it('монтирует cleanup provider выше PrivateWorkspace внутри route guard', () => {
    render(<PrivateLayout>Приватный экран</PrivateLayout>);

    const privateRoute = screen.getByTestId('private-route');
    const cleanupProvider = within(privateRoute).getByTestId('delete-cleanup-provider');
    const privateWorkspace = within(cleanupProvider).getByTestId('private-workspace');
    expect(privateWorkspace).toHaveTextContent('Приватный экран');
  });
});
