import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import WorkspaceLayout from './layout';

vi.mock('@/widgets/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

describe('WorkspaceLayout', () => {
  it('монтирует продуктовый экран внутри AppShell', () => {
    render(<WorkspaceLayout>Продуктовый экран</WorkspaceLayout>);

    expect(screen.getByTestId('app-shell')).toHaveTextContent('Продуктовый экран');
  });
});
