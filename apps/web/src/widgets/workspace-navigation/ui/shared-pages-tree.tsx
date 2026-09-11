'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { PageTreeNodeDto } from '@/shared/api';
import { Button, Text } from '@/shared/ui';

type SharedPagesTreeProps = Readonly<{
  isError?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
  onSelectPage: (pageId: string) => void;
  pages: readonly PageTreeNodeDto[];
}>;

export function SharedPagesTree({
  isError = false,
  isLoading = false,
  onRetry,
  onSelectPage,
  pages,
}: SharedPagesTreeProps) {
  return (
    <section aria-labelledby="shared-pages-title" className="mt-8 space-y-2">
      <h2 className="text-sm font-semibold" id="shared-pages-title">
        Доступные мне
      </h2>
      {isLoading ? (
        <Text aria-busy="true" variant="caption">
          Загружаем доступные страницы…
        </Text>
      ) : isError ? (
        <div className="space-y-2">
          <Text role="alert" variant="error">
            Не удалось загрузить доступные страницы.
          </Text>
          <Button type="button" variant="outline" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      ) : pages.length === 0 ? (
        <Text variant="caption">Пока нет доступных страниц.</Text>
      ) : (
        <ul aria-label="Доступные страницы" className="space-y-0.5">
          <SharedPagesList nodes={pages} onSelectPage={onSelectPage} />
        </ul>
      )}
    </section>
  );
}

function SharedPagesList({
  nodes,
  onSelectPage,
}: Readonly<{
  nodes: readonly PageTreeNodeDto[];
  onSelectPage: (pageId: string) => void;
}>) {
  return nodes.map((node) => (
    <SharedPageItem key={node.id} node={node} onSelectPage={onSelectPage} />
  ));
}

function SharedPageItem({
  node,
  onSelectPage,
}: Readonly<{
  node: PageTreeNodeDto;
  onSelectPage: (pageId: string) => void;
}>) {
  const [expanded, setExpanded] = useState(false);
  const title = node.title.trim() || 'Без названия';
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div className="flex min-h-9 items-center gap-1 rounded-md pr-1 hover:bg-accent/60">
        {hasChildren ? (
          <button
            aria-label={expanded ? `Свернуть ${title}` : `Раскрыть ${title}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        ) : (
          <span aria-hidden="true" className="size-7 shrink-0" />
        )}
        <button
          className="min-w-0 flex-1 truncate rounded px-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          type="button"
          onClick={() => onSelectPage(node.id)}
        >
          {title}
        </button>
      </div>
      {expanded && hasChildren ? (
        <ul className="ml-4">
          <SharedPagesList nodes={node.children} onSelectPage={onSelectPage} />
        </ul>
      ) : null}
    </li>
  );
}
