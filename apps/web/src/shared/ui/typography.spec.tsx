import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Heading } from './heading';
import { Text } from './text';

afterEach(cleanup);

describe('typography primitives', () => {
  it('отделяет semantic heading level от визуального варианта и объединяет классы', () => {
    render(
      <Heading as="h2" variant="page" className="text-center text-2xl" id="page-title">
        Настройки
      </Heading>,
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Настройки' });
    expect(heading).toHaveAttribute('id', 'page-title');
    expect(heading).toHaveClass('font-semibold', 'tracking-tight', 'text-center', 'text-2xl');
    expect(heading).not.toHaveClass('text-heading-page');
  });

  it('рендерит paragraph по умолчанию и применяет текстовый вариант', () => {
    render(<Text variant="caption">Подсказка</Text>);

    const text = screen.getByText('Подсказка');
    expect(text.tagName).toBe('P');
    expect(text).toHaveClass('text-copy-small', 'text-muted-foreground');
  });

  it('передаёт semantic span props и alert role', () => {
    render(
      <Text as="span" variant="error" className="mt-2 text-xs" role="alert">
        Не удалось сохранить
      </Text>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.tagName).toBe('SPAN');
    expect(alert).toHaveClass('text-xs', 'text-destructive', 'mt-2');
    expect(alert).not.toHaveClass('text-copy-small');
  });
});
