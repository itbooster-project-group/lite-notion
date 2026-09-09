import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, Label } from '@/shared/ui';

afterEach(cleanup);
describe('Checkbox', () => {
  it('toggles from a label and keyboard and exposes mixed state', () => {
    const change = vi.fn();
    const view = render(
      <>
        <Label htmlFor="agree">Согласие</Label>
        <Checkbox id="agree" onCheckedChange={change} />
      </>,
    );
    fireEvent.click(screen.getByText('Согласие'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(change).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(screen.getByRole('checkbox'), { key: ' ' });
    expect(change).toHaveBeenLastCalledWith(false);
    view.rerender(<Checkbox aria-label="Согласие" indeterminate onCheckedChange={change} />);
    expect(screen.getByRole('checkbox')).toBePartiallyChecked();
  });
  it('preserves controlled values, errors and disabled', () => {
    const change = vi.fn();
    render(
      <>
        <Checkbox
          aria-label="Согласие"
          checked
          disabled
          aria-invalid
          aria-describedby="error"
          onCheckedChange={change}
        />
        <p id="error">Нет разрешения</p>
      </>,
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(change).not.toHaveBeenCalled();
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription('Нет разрешения');
  });
  it('submits named values and restores uncontrolled defaults on reset', async () => {
    render(
      <form aria-label="Форма">
        <Checkbox aria-label="Согласие" name="agree" value="yes" defaultChecked />
      </form>,
    );
    const form = screen.getByRole('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected form');
    expect(new FormData(form).get('agree')).toBe('yes');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(new FormData(form).has('agree')).toBe(false);
    await act(async () => form.reset());
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
