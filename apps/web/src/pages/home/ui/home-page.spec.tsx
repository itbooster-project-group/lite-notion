import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomePage } from './home-page';

vi.mock('@/entities/session', () => ({
  useSession: () => ({ user: { name: 'Ada' } }),
}));

afterEach(cleanup);

describe('home page', () => {
  it('показывает только персонализированное приветствие', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Добро пожаловать, Ada' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lite Notion')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ваша сессия восстановлена/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть профиль' })).not.toBeInTheDocument();
  });
});
