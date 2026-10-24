'use client';

import { Search } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { useSearchPages } from '@/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Text,
} from '@/shared/ui';

const DEBOUNCE_MS = 300;
const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 20;

export function PageSearch({ onSelectPage }: Readonly<{ onSelectPage: (pageId: string) => void }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (event.altKey || event.shiftKey) return;
      if (open) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        ref={triggerRef}
        render={
          <Button
            aria-haspopup="dialog"
            className="shrink-0"
            size="icon-sm"
            title="Поиск страниц"
            type="button"
            variant="ghost"
          />
        }
      >
        <Search aria-hidden="true" />
        <span className="sr-only">Поиск страниц</span>
      </DialogTrigger>
      {open ? (
        <PageSearchDialogContent
          inputRef={inputRef}
          onSelect={(pageId) => {
            setOpen(false);
            onSelectPage(pageId);
          }}
          triggerRef={triggerRef}
        />
      ) : null}
    </Dialog>
  );
}

function PageSearchDialogContent({
  inputRef,
  onSelect,
  triggerRef,
}: Readonly<{
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (pageId: string) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}>) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const normalizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
  const queryIsSettled = normalizedQuery === debouncedQuery;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(normalizedQuery), DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery]);

  const search = useSearchPages(
    { query: debouncedQuery, limit: RESULT_LIMIT },
    {
      query: {
        enabled: queryIsSettled && debouncedQuery.length > 0,
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  );
  const results = queryIsSettled && !search.isFetching ? (search.data ?? []) : [];
  const activeResult = activeIndex >= 0 ? results[activeIndex] : undefined;

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(results.length - 1);
  }, [activeIndex, results.length]);

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex].pageId);
    }
  }

  const loading = normalizedQuery.length > 0 && (!queryIsSettled || search.isFetching);

  return (
    <DialogContent
      aria-describedby="page-search-description"
      aria-labelledby="page-search-title"
      className="top-[10dvh] h-[80dvh] max-h-[80dvh] -translate-y-0 overflow-hidden p-0 sm:max-w-2xl"
      finalFocus={() => triggerRef.current}
      initialFocus={inputRef}
      showCloseButton
      closeLabel="Закрыть поиск"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b p-4 pr-12">
          <DialogTitle className="text-base" id="page-search-title">
            Поиск страниц
          </DialogTitle>
          <DialogDescription className="sr-only" id="page-search-description">
            Поиск страниц по названию и содержимому
          </DialogDescription>
          <Input
            aria-activedescendant={
              activeResult ? `search-result-${activeResult.pageId}` : undefined
            }
            aria-autocomplete="list"
            aria-controls="page-search-results"
            aria-expanded={results.length > 0}
            aria-label="Поиск страниц"
            autoComplete="off"
            className="mt-3 h-11 text-base"
            maxLength={MAX_QUERY_LENGTH}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Название или текст страницы"
            ref={inputRef}
            role="combobox"
            value={query}
          />
        </header>
        <div
          aria-label="Результаты поиска"
          className="min-h-0 flex-1 overflow-y-auto p-2"
          id="page-search-results"
          role="listbox"
        >
          {!normalizedQuery ? (
            <Text className="p-3" variant="caption">
              Введите запрос для поиска.
            </Text>
          ) : null}
          {loading ? (
            <Text aria-live="polite" aria-busy="true" className="p-3">
              Ищем страницы…
            </Text>
          ) : null}
          {queryIsSettled && search.isError ? (
            <div className="space-y-2 p-3">
              <Text role="alert" variant="error">
                Не удалось выполнить поиск.
              </Text>
              <Button onClick={() => void search.refetch()} type="button" variant="outline">
                Повторить поиск
              </Button>
            </div>
          ) : null}
          {queryIsSettled && !search.isFetching && search.isSuccess && results.length === 0 ? (
            <div className="space-y-2 p-3">
              <Text>Ничего не найдено.</Text>
              <Button onClick={() => void search.refetch()} type="button" variant="outline">
                Повторить поиск
              </Button>
            </div>
          ) : null}
          {results.map((result, index) => (
            <button
              aria-selected={activeIndex === index}
              className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring data-[active=true]:bg-accent"
              data-active={activeIndex === index}
              id={`search-result-${result.pageId}`}
              key={result.pageId}
              onClick={() => onSelect(result.pageId)}
              onMouseMove={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span className="font-medium">{result.title}</span>
              {result.snippet ? (
                <span className="line-clamp-2 text-muted-foreground">{result.snippet}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </DialogContent>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}
