import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/shared/api/mocks/server';
import { PageSearch } from './page-search';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

function renderSearch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    ...render(<PageSearch onSelectPage={(pageId) => navigation.push(`/pages/${pageId}`)} />, {
      wrapper: Wrapper,
    }),
    queryClient,
  };
}

async function finishDebounce() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await act(async () => {});
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navigation.push.mockReset();
});

describe('PageSearch', () => {
  it('opens from the trigger and shortcut, focuses the query, and restores focus on Escape', async () => {
    renderSearch();
    const trigger = screen.getByRole('button', { name: 'Поиск страниц' });
    fireEvent.click(trigger);
    const input = await screen.findByRole('combobox', { name: 'Поиск страниц' });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const shortcutInput = await screen.findByRole('combobox', { name: 'Поиск страниц' });
    await waitFor(() => expect(shortcutInput).toHaveFocus());
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(shortcutInput).toHaveFocus();
  });

  it('debounces trimmed queries and shows only current results as plain text', async () => {
    const queries: string[] = [];
    server.use(
      http.get('*/api/v1/search', ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('query') ?? '');
        return HttpResponse.json([
          {
            pageId: 'page-1',
            title: 'Page <img src=x>',
            snippet: '<script>alert(1)</script> match',
          },
        ]);
      }),
    );
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск страниц' }));
    const input = screen.getByRole('combobox', { name: 'Поиск страниц' });
    expect(queries).toEqual([]);
    fireEvent.change(input, { target: { value: '  first ' } });
    await finishDebounce();
    expect(queries).toEqual(['first']);
    expect(await screen.findByRole('option', { name: /Page <img src=x>/ })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(queries).toEqual(['first']);
    expect(screen.getByText('<script>alert(1)</script> match')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();

    fireEvent.change(input, { target: { value: 'second' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await finishDebounce();
    await waitFor(() => expect(queries).toEqual(['first', 'second']));
  });

  it('manually retries both empty results and API errors', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/search', () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json([]);
        if (calls === 2)
          return HttpResponse.json({ message: 'private backend detail' }, { status: 500 });
        return HttpResponse.json([{ pageId: 'page-2', title: 'Found', snippet: null }]);
      }),
    );
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск страниц' }));
    const input = await screen.findByRole('combobox', { name: 'Поиск страниц' });
    fireEvent.change(input, { target: { value: 'needle' } });
    await finishDebounce();
    expect(await screen.findByText('Ничего не найдено.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить поиск' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить поиск.');
    expect(screen.queryByText('private backend detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить поиск' }));
    expect(await screen.findByRole('option', { name: 'Found' })).toBeInTheDocument();
    expect(calls).toBe(3);
  });

  it('selects results by keyboard and begins navigation immediately', async () => {
    server.use(
      http.get('*/api/v1/search', () =>
        HttpResponse.json([{ pageId: 'target-page', title: 'Target', snippet: 'Text' }]),
      ),
    );
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск страниц' }));
    const input = await screen.findByRole('combobox', { name: 'Поиск страниц' });
    fireEvent.change(input, { target: { value: 'target' } });
    await finishDebounce();
    await screen.findByRole('option', { name: /Target/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'search-result-target-page');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigation.push).toHaveBeenCalledWith('/pages/target-page');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a late response from an earlier query out of the current results', async () => {
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.get('*/api/v1/search', async ({ request }) => {
        const query = new URL(request.url).searchParams.get('query');
        if (query === 'first') {
          markFirstStarted?.();
          await firstReleased;
          return HttpResponse.json([{ pageId: 'old-page', title: 'Old result', snippet: null }]);
        }
        return HttpResponse.json([{ pageId: 'new-page', title: 'New result', snippet: null }]);
      }),
    );
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск страниц' }));
    const input = screen.getByRole('combobox', { name: 'Поиск страниц' });
    fireEvent.change(input, { target: { value: 'first' } });
    await finishDebounce();
    await firstStarted;

    fireEvent.change(input, { target: { value: 'second' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await finishDebounce();
    expect(await screen.findByRole('option', { name: 'New result' })).toBeInTheDocument();
    releaseFirst?.();
    await Promise.resolve();
    expect(screen.queryByRole('option', { name: 'Old result' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'New result' })).toBeInTheDocument();
  });

  it('does not take the editor shortcut from an editable target', () => {
    renderSearch();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.append(editor);
    editor.focus();
    fireEvent.keyDown(editor, { key: 'k', ctrlKey: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    editor.remove();
  });
});
