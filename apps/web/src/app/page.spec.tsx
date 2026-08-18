import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import HomePage from './page';

afterEach(cleanup);

describe('HomePage', () => {
  it('показывает технический заголовок', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Lite Notion запущен' })).toBeInTheDocument();
  });
});
