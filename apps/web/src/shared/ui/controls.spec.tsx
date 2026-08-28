import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './button';
import { Input } from './input';

afterEach(cleanup);

describe('shared controls', () => {
  it('сохраняет height variant shadcn Button', () => {
    render(<Button size="sm">Небольшая кнопка</Button>);

    const button = screen.getByRole('button', { name: 'Небольшая кнопка' });
    expect(button).toHaveClass('h-6', 'rounded-lg');
    expect(button).not.toHaveClass('h-10');
  });

  it('не переопределяет default height shadcn Input', () => {
    render(<Input aria-label="Название" />);

    const input = screen.getByRole('textbox', { name: 'Название' });
    expect(input).toHaveClass('h-7', 'rounded-lg');
    expect(input).not.toHaveClass('h-9', 'h-10');
  });
});
