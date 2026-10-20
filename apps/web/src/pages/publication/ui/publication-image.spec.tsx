import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicationImage } from './publication-image';

describe('PublicationImage', () => {
  it('replaces a resolver 404 after SSR with a safe browser fallback', () => {
    render(<PublicationImage alt="Published diagram" src="https://api.example.test/resolver" />);
    fireEvent.error(screen.getByRole('img', { name: 'Published diagram' }));

    expect(screen.getByRole('img', { name: 'Published diagram' })).toHaveTextContent(
      'Изображение недоступно',
    );
  });
});
