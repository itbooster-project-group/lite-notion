import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import HomePage from './page';

afterEach(cleanup);

describe('HomePage', () => {
  it('показывает доступный smoke UI', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Lite Notion' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Название заметки' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать заметку' })).toBeInTheDocument();
  });
});
