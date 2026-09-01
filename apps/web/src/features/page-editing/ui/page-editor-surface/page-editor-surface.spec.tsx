import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { pageDocumentToJSON } from '@/entities/page-document';

import { PageEditorSurface } from './page-editor-surface';

const documents: Y.Doc[] = [];

afterEach(() => {
  cleanup();
  for (const doc of documents) doc.destroy();
  documents.length = 0;
});

describe('page editor surface document lifecycle', () => {
  it('закрывает LinkForm и очищает document-specific selection при замене Y.Doc', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    documents.push(docA, docB);

    const view = render(<PageEditorSurface doc={docA} editable />);
    const editor = await screen.findByRole('textbox', { name: 'Содержимое страницы' });

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'k' });
    const staleApplyButton = await screen.findByRole('button', { name: 'Применить' });
    expect(screen.getByRole('form', { name: 'Ссылка' })).toBeInTheDocument();

    view.rerender(<PageEditorSurface doc={docB} editable />);

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Ссылка' })).not.toBeInTheDocument(),
    );
    const replacementContent = pageDocumentToJSON(docB);

    staleApplyButton.click();

    expect(pageDocumentToJSON(docB)).toEqual(replacementContent);
  });
});
