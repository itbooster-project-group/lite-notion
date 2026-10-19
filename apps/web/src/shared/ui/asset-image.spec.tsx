import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetImage } from './asset-image';

afterEach(cleanup);

describe('AssetImage', () => {
  it('renders resolved image data and forwards load errors without resolving assets itself', () => {
    const onImageError = vi.fn();
    render(
      <AssetImage
        alt="Карта"
        fallback={<span role="status">Нет изображения</span>}
        onImageError={onImageError}
        src="https://cdn.example.com/signed.jpg"
        state="ready"
      />,
    );

    const image = screen.getByRole('img', { name: 'Карта' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/signed.jpg');
    fireEvent.error(image);
    expect(onImageError).toHaveBeenCalledOnce();
  });

  it.each(['loading', 'unavailable'] as const)(
    'uses the supplied fallback in %s state',
    (state) => {
      render(
        <AssetImage
          alt="Карта"
          fallback={<span role="status">Нет изображения</span>}
          src="https://cdn.example.com/signed.jpg"
          state={state}
        />,
      );

      expect(screen.getByRole('status')).toHaveTextContent('Нет изображения');
      expect(screen.queryByRole('img', { name: 'Карта' })).not.toBeInTheDocument();
    },
  );
});
