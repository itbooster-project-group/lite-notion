import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Link from 'next/link';
import { createRef } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@/shared/ui';

afterEach(cleanup);

describe('Button public behavior', () => {
  it('keeps icon button mounted and focused when loading hides its tooltip', async () => {
    const view = render(
      <Button size="icon" aria-label="Добавить">
        +
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Добавить' });
    act(() => button.focus());
    await screen.findByText('Добавить');
    view.rerender(
      <Button size="icon" aria-label="Добавить" loading>
        +
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Добавить' })).toBe(button);
    expect(button).toHaveFocus();
    await waitFor(() => expect(screen.queryByText('Добавить')).not.toBeInTheDocument());
  });
  it('blocks loading activation and submission while preserving focus and name', () => {
    const click = vi.fn();
    const submit = vi.fn((event) => event.preventDefault());
    const view = render(
      <form onSubmit={submit}>
        <Button onClick={click} type="submit">
          Сохранить
        </Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    act(() => button.focus());
    view.rerender(
      <form onSubmit={submit}>
        <Button loading onClick={click} type="submit">
          Сохранить
        </Button>
      </form>,
    );
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('prevents loading link navigation and composed click handlers', () => {
    const click = vi.fn();
    render(
      <Button
        loading
        nativeButton={false}
        role="link"
        render={<Link href="/destination" onClick={click} />}
      >
        Перейти
      </Button>,
    );
    expect(fireEvent.click(screen.getByRole('link', { name: 'Перейти' }))).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it('does not open a dialog from a loading trigger', () => {
    render(
      <Dialog>
        <DialogTrigger render={<Button loading />}>Открыть</DialogTrigger>
        <DialogContent>
          <DialogTitle>Настройки</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves disabled semantics and forwarded ref', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Button ref={ref} disabled loading>
        Удалить
      </Button>,
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Удалить' }));
    expect(ref.current).toBeDisabled();
  });

  it('retains an accessible tooltip for an enabled icon button', async () => {
    render(
      <Button aria-label="Добавить" size="icon">
        <span aria-hidden="true">+</span>
      </Button>,
    );
    act(() => screen.getByRole('button', { name: 'Добавить' }).focus());
    expect(await screen.findByText('Добавить')).toHaveTextContent('Добавить');
  });
});

describe('text controls', () => {
  it('preserves label, error description, ref and native input size', () => {
    const ref = createRef<HTMLInputElement>();
    const change = vi.fn();
    const blur = vi.fn();
    render(
      <>
        <Label htmlFor="title">Название</Label>
        <Input
          ref={ref}
          id="title"
          size={20}
          controlSize="lg"
          aria-invalid
          aria-describedby="error"
          onChange={change}
          onBlur={blur}
        />
        <p id="error">Обязательное поле</p>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Название' });
    expect(input).toHaveAccessibleDescription('Обязательное поле');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('size', '20');
    expect(ref.current).toBe(input);
    fireEvent.change(input, { target: { value: 'Документ' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledOnce();
    expect(blur).toHaveBeenCalledOnce();
  });

  it('supports textarea rows, controlled changes and disabled', () => {
    const change = vi.fn();
    const view = render(<Textarea aria-label="Описание" rows={5} value="" onChange={change} />);
    const textarea = screen.getByRole('textbox', { name: 'Описание' });
    expect(textarea).toHaveAttribute('rows', '5');
    expect(textarea).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(textarea, { target: { value: 'Текст' } });
    expect(change).toHaveBeenCalledOnce();
    view.rerender(<Textarea aria-label="Описание" disabled value="Текст" />);
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue('Текст');
  });

  it('keeps React Hook Form register integration', async () => {
    const submit = vi.fn();
    function Form() {
      const { register, handleSubmit } = useForm<{ title: string }>();
      return (
        <form onSubmit={handleSubmit(submit)}>
          <Input aria-label="Название" {...register('title')} />
          <Button type="submit">Готово</Button>
        </form>
      );
    }
    render(<Form />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Документ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ title: 'Документ' }, expect.anything()),
    );
  });
});
