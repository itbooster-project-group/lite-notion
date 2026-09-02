import type { Editor, JSONContent } from '@tiptap/core';
import {
  collectPageDocumentNodeIds,
  preparePageDocumentContentForInsertion,
} from '@/entities/page-document';

export function insertPageDocumentContent(editor: Editor, content: JSONContent): boolean {
  const preparedContent = preparePageDocumentContentForInsertion(
    content,
    collectPageDocumentNodeIds(editor.getJSON()),
  );

  return editor.commands.insertContent(preparedContent);
}
