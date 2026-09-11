import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle, Label, Select, type SelectOption } from '@/shared/ui';

const options: SelectOption[] = [
  { value: 'a', label: 'Альфа' },
  { value: 'b', label: 'Бета' },
  { value: 'c', label: 'Гамма' },
  { value: 'd', label: 'Недоступно', disabled: true },
];
afterEach(cleanup);
const modes = [
  { multiple: false, searchable: false },
  { multiple: true, searchable: false },
  { multiple: false, searchable: true },
  { multiple: true, searchable: true },
] as const;

describe.each(modes)('Select $multiple / search $searchable', (mode) => {
  it('keeps controlled values until the parent updates them', async () => {
    const change = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const control = (updated: boolean) =>
      mode.multiple ? (
        <Select
          multiple
          searchable={mode.searchable}
          options={options}
          value={updated ? ['b'] : ['a']}
          onValueChange={change}
          ref={ref}
          aria-label="Категория"
        />
      ) : (
        <Select
          searchable={mode.searchable}
          options={options}
          value={updated ? 'b' : 'a'}
          onValueChange={change}
          ref={ref}
          aria-label="Категория"
        />
      );
    const view = render(control(false));
    const trigger = screen.getByRole('combobox', { name: 'Категория' });
    expect(ref.current).toBe(trigger);
    fireEvent.click(trigger);
    const beta = await screen.findByRole('option', { name: 'Бета' });
    fireEvent.pointerDown(beta);
    fireEvent.click(beta);
    expect(change).toHaveBeenLastCalledWith(mode.multiple ? ['a', 'b'] : 'b');
    expect(trigger).toHaveTextContent('Альфа');
    view.rerender(control(true));
    expect(trigger).toHaveTextContent('Бета');
  });

  it('restores nonempty defaults and excludes disabled values from FormData', async () => {
    const control = (disabled: boolean) => (
      <form aria-label="Форма">
        {mode.multiple ? (
          <Select
            multiple
            searchable={mode.searchable}
            options={options}
            defaultValue={['a', 'b']}
            name="category"
            aria-label="Категория"
            clearable
            disabled={disabled}
          />
        ) : (
          <Select
            searchable={mode.searchable}
            options={options}
            defaultValue="a"
            name="category"
            aria-label="Категория"
            clearable
            disabled={disabled}
          />
        )}
      </form>
    );
    const view = render(control(false));
    const form = screen.getByRole('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected form');
    expect(new FormData(form).getAll('category')).toEqual(mode.multiple ? ['a', 'b'] : ['a']);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить выбор' }));
    await act(async () => form.reset());
    expect(new FormData(form).getAll('category')).toEqual(mode.multiple ? ['a', 'b'] : ['a']);
    view.rerender(control(true));
    expect(new FormData(form).has('category')).toBe(false);
  });
  it('selects values, blocks disabled options and clears', async () => {
    const change = vi.fn();
    render(
      <Select
        {...mode}
        options={options}
        aria-label="Категория"
        onValueChange={change}
        clearable
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Категория' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'Недоступно' }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Альфа' }));
    fireEvent.click(screen.getByRole('option', { name: 'Альфа' }));
    expect(change).toHaveBeenLastCalledWith(mode.multiple ? ['a'] : 'a');
    expect(trigger).toHaveTextContent('Альфа');
    if (mode.multiple) {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Бета' }));
      fireEvent.click(screen.getByRole('option', { name: 'Бета' }));
      expect(change).toHaveBeenLastCalledWith(['a', 'b']);
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Альфа' }));
      fireEvent.click(screen.getByRole('option', { name: 'Альфа' }));
      expect(change).toHaveBeenLastCalledWith(['b']);
      fireEvent.keyDown(
        mode.searchable
          ? screen.getByRole('combobox', { name: 'Поиск вариантов' })
          : screen.getByRole('option', { name: 'Бета' }),
        { key: 'Escape' },
      );
    }
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Очистить выбор' }));
    expect(change).toHaveBeenLastCalledWith(mode.multiple ? [] : null);
    expect(trigger).toHaveFocus();
  });

  it('submits and resets values', async () => {
    render(
      <form aria-label="Форма">
        <Select {...mode} options={options} aria-label="Категория" name="category" />
      </form>,
    );
    const form = screen.getByRole('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected form');
    expect(new FormData(form).has('category')).toBe(false);
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Альфа' }));
    expect(new FormData(form).getAll('category')).toEqual(['a']);
    await act(async () => form.reset());
    expect(new FormData(form).has('category')).toBe(false);
  });

  it('exposes label/error and cannot open when disabled', () => {
    render(
      <>
        <Label htmlFor="category">Категория</Label>
        <Select
          {...mode}
          options={options}
          id="category"
          disabled
          aria-invalid
          aria-describedby="error"
        />
        <p id="error">Нет доступа</p>
      </>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Категория' });
    expect(trigger).toHaveAccessibleDescription('Нет доступа');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

it.each([false, true])('integrates with RHF Controller searchable=%s', async (searchable) => {
  function Form() {
    const { control, reset, setFocus } = useForm<{ category: string | null }>({
      defaultValues: { category: null },
    });
    return (
      <>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              options={options}
              searchable={searchable}
              aria-label="Категория"
              {...field}
              onValueChange={field.onChange}
            />
          )}
        />
        <button type="button" onClick={() => reset({ category: 'b' })}>
          Сбросить
        </button>
        <button type="button" onClick={() => setFocus('category')}>
          Фокус
        </button>
      </>
    );
  }
  render(<Form />);
  const trigger = screen.getByRole('combobox', { name: 'Категория' });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('option', { name: 'Альфа' }));
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  expect(trigger).toHaveTextContent('Альфа');
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
  expect(trigger).toHaveTextContent('Бета');
  fireEvent.click(screen.getByRole('button', { name: 'Фокус' }));
  expect(trigger).toHaveFocus();
});

describe.each([false, true])('searchable Select multiple=%s', (multiple) => {
  it('filters without losing selection and resets query on reopen', async () => {
    const change = vi.fn();
    render(
      multiple ? (
        <Select
          multiple
          searchable
          defaultValue={['a']}
          options={options}
          aria-label="Категория"
          onValueChange={change}
        />
      ) : (
        <Select
          searchable
          defaultValue="a"
          options={options}
          aria-label="Категория"
          onValueChange={change}
        />
      ),
    );
    const trigger = screen.getByRole('combobox', { name: 'Категория' });
    fireEvent.click(trigger);
    const search = await screen.findByRole('combobox', { name: 'Поиск вариантов' });
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.change(search, { target: { value: 'БЕТ' } });
    expect(screen.getByRole('option', { name: 'Бета' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Альфа' })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Альфа');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: 'нет совпадений' } });
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    expect(await screen.findByRole('combobox', { name: 'Поиск вариантов' })).toHaveValue('');
  });
});

it('announces all multiple labels and limits the visible summary', () => {
  render(<Select multiple options={options} value={['a', 'b', 'c']} aria-label="Категория" />);
  const trigger = screen.getByRole('combobox');
  expect(trigger).toHaveTextContent('Альфа, Бета +1');
  expect(trigger).toHaveAccessibleDescription('Альфа, Бета, Гамма');
});

it.each([false, true])(
  'shows a distinct empty source message searchable=%s',
  async (searchable) => {
    render(<Select options={[]} searchable={searchable} aria-label="Категория" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Нет доступных вариантов');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  },
);

it.each(modes)('closes only the select on Escape inside Dialog: %j', async (mode) => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Настройки</DialogTitle>
        <Select {...mode} options={options} aria-label="Категория" />
      </DialogContent>
    </Dialog>,
  );
  const trigger = await screen.findByRole('combobox', { name: 'Категория' });
  fireEvent.click(trigger);
  await screen.findByRole('option', { name: 'Альфа' });
  const active = document.activeElement;
  if (!active) throw new Error('Missing focus');
  fireEvent.keyDown(active, { key: 'ArrowDown' });
  fireEvent.keyDown(document.activeElement ?? active, { key: 'Escape' });
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});
