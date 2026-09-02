'use client';

import type { Editor } from '@tiptap/core';
import { Link2Off } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { normalizePageDocumentLink } from '@/entities/page-document';
import { Button, Input } from '@/shared/ui';

import {
  createPageDocumentRelativeSelection,
  type PageDocumentRelativeSelection,
  resolvePageDocumentRelativeSelection,
} from '../../model/page-document-relative-selection';

export type LinkFormProps = Readonly<{
  editor: Editor;
  initialSelection?: PageDocumentRelativeSelection | undefined;
  onClose(): void;
}>;

function getActiveLinkHref(editor: Editor): string {
  const href = editor.getAttributes('link').href;
  return typeof href === 'string' ? href : '';
}

export function LinkForm({ editor, initialSelection, onClose }: LinkFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialHrefRef = useRef(getActiveLinkHref(editor));
  const selectionRef = useRef<PageDocumentRelativeSelection | undefined>(
    initialSelection ?? createPageDocumentRelativeSelection(editor),
  );
  const [error, setError] = useState<string | null>(null);
  const [href, setHref] = useState(initialHrefRef.current);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function closeAndFocusEditor() {
    selectionRef.current = undefined;
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }

  function applyLink() {
    const normalizedHref = normalizePageDocumentLink(href);

    if (!normalizedHref) {
      setError('Укажите корректный адрес ссылки.');
      return;
    }

    const savedSelection = selectionRef.current;
    const selection = savedSelection
      ? resolvePageDocumentRelativeSelection(editor, savedSelection)
      : undefined;

    if (!selection) {
      setError('Выделение больше недоступно. Выберите текст заново.');
      return;
    }

    const chain = editor.chain().setTextSelection(selection).focus();
    if (initialHrefRef.current) {
      chain.extendMarkRange('link').setLink({ href: normalizedHref }).run();
    } else if (selection.from === selection.to) {
      chain
        .insertContent({
          marks: [{ attrs: { href: normalizedHref }, type: 'link' }],
          text: normalizedHref,
          type: 'text',
        })
        .run();
    } else {
      chain.setLink({ href: normalizedHref }).run();
    }
    closeAndFocusEditor();
  }

  function removeLink() {
    const savedSelection = selectionRef.current;
    const selection = savedSelection
      ? resolvePageDocumentRelativeSelection(editor, savedSelection)
      : undefined;

    if (!selection) {
      setError('Выделение больше недоступно. Выберите текст заново.');
      return;
    }

    const chain = editor.chain().setTextSelection(selection).focus();
    if (initialHrefRef.current) chain.extendMarkRange('link');
    chain.unsetLink().run();
    closeAndFocusEditor();
  }

  return (
    <form
      aria-label="Ссылка"
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeAndFocusEditor();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        applyLink();
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium" htmlFor="page-editor-link-url">
        Адрес ссылки
      </label>
      <Input
        aria-describedby={error ? 'page-editor-link-error' : undefined}
        aria-invalid={Boolean(error)}
        id="page-editor-link-url"
        inputMode="url"
        onChange={(event) => {
          setError(null);
          setHref(event.target.value);
        }}
        placeholder="https://example.com"
        ref={inputRef}
        type="text"
        value={href}
      />
      {error && (
        <p className="text-sm text-destructive" id="page-editor-link-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {initialHrefRef.current && (
          <Button onClick={removeLink} type="button" variant="ghost">
            <Link2Off aria-hidden="true" />
            Удалить ссылку
          </Button>
        )}
        <Button onClick={closeAndFocusEditor} type="button" variant="outline">
          Отмена
        </Button>
        <Button onClick={applyLink} type="button">
          Применить
        </Button>
      </div>
    </form>
  );
}
