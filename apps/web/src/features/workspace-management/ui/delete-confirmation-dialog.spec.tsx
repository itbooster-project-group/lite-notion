import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DeleteConfirmationDialog,
  type DeleteConfirmationIntent,
} from './delete-confirmation-dialog';

afterEach(cleanup);

function renderDialog(
  intent: DeleteConfirmationIntent | undefined,
  options: Partial<{
    error: string;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }> = {},
) {
  const onCancel = options.onCancel ?? vi.fn();
  const onConfirm = options.onConfirm ?? vi.fn();

  render(
    <DeleteConfirmationDialog
      error={options.error}
      intent={intent}
      pending={options.pending ?? false}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  return { onCancel, onConfirm };
}

describe('DeleteConfirmationDialog', () => {
  it('показывает актуальное имя удаляемого resource', () => {
    const { rerender } = render(
      <DeleteConfirmationDialog
        error={undefined}
        intent={{ kind: 'page', returnFocus: undefined, title: 'First page' }}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Страница «First page» и все вложенные страницы будут перемещены в корзину.',
      ),
    ).toBeInTheDocument();

    rerender(
      <DeleteConfirmationDialog
        error={undefined}
        intent={{ kind: 'project', name: 'Second project', returnFocus: undefined }}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Проект «Second project» и все его страницы будут перемещены в корзину.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/First page/)).not.toBeInTheDocument();
  });

  it('до confirm закрывается через Cancel без DELETE и возвращает focus', async () => {
    const onConfirm = vi.fn();
    render(<ControlledDialog onConfirm={onConfirm} />);

    const trigger = screen.getByRole('button', { name: 'Open delete' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('до confirm закрывается через Escape без DELETE и возвращает focus', async () => {
    const onConfirm = vi.fn();
    render(<ControlledDialog onConfirm={onConfirm} />);

    const trigger = screen.getByRole('button', { name: 'Open delete' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('во время pending блокирует повторный submit и dismiss events', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderDialog(
      {
        kind: 'project',
        name: 'Locked project',
        returnFocus: undefined,
      },
      { onCancel, onConfirm, pending: true },
    );

    expect(await screen.findByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: 'Удаляем…' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    if (overlay) {
      fireEvent.pointerDown(overlay);
      fireEvent.click(overlay);
    }

    expect(screen.getByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('после error оставляет dialog открытым и снова разрешает close/retry', async () => {
    const { onCancel, onConfirm } = renderDialog(
      {
        kind: 'page',
        returnFocus: undefined,
        title: 'Failed page',
      },
      { error: 'Не удалось удалить страницу', pending: false },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить страницу');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

function ControlledDialog({ onConfirm }: Readonly<{ onConfirm: () => void }>) {
  const [intent, setIntent] = useState<DeleteConfirmationIntent>();

  return (
    <>
      <button
        type="button"
        onClick={(event) =>
          setIntent({
            kind: 'page',
            returnFocus: event.currentTarget,
            title: 'Draft page',
          })
        }
      >
        Open delete
      </button>
      <DeleteConfirmationDialog
        error={undefined}
        intent={intent}
        pending={false}
        onCancel={() => setIntent(undefined)}
        onConfirm={onConfirm}
      />
    </>
  );
}
