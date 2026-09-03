import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { Modal, ModalPrimitive } from './modal';

afterEach(cleanup);

function TestModal({ onOpenChange = vi.fn() }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Modal
      onOpenChange={onOpenChange}
      open
      title="Тестовый диалог"
      trigger={<Button>Открыть</Button>}
    >
      <button type="button">Первое действие</button>
      <button type="button">Второе действие</button>
      <ModalPrimitive.Close>Закрыть</ModalPrimitive.Close>
    </Modal>
  );
}

describe('Modal', () => {
  it('отображает именованный модальный диалог и запрашивает закрытие по Escape', () => {
    const onOpenChange = vi.fn();
    render(<TestModal onOpenChange={onOpenChange} />);

    expect(screen.getByRole('dialog', { name: 'Тестовый диалог' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });

  it('удерживает фокус внутри модального диалога', () => {
    render(<TestModal />);
    const dialog = screen.getByRole('dialog', { name: 'Тестовый диалог' });

    screen.getByRole('button', { name: 'Второе действие' }).focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });

    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
