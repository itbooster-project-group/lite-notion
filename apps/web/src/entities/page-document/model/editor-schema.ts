import type { Extensions } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { Doc as YDoc } from 'yjs';
import type { CollaborationProvider } from '@/shared/collaboration';
import { resolvePresenceColor } from '@/shared/lib/presence-color';
import { PageDocumentNodeIdDeconflict } from './node-id-deconflict';
import { createPageDocumentSchemaExtensions, type PageDocumentImage } from './page-document-schema';
import { PAGE_CONTENT_YJS_FIELD } from './schema-version';

export {
  createPageDocumentSchemaExtensions,
  getPageDocumentSchema,
  PageDocumentImage,
  PageDocumentVideo,
  PageDocumentYoutube,
} from './page-document-schema';

export function createPageDocumentEditorExtensions(
  document: YDoc,
  collaboration?: Readonly<{
    provider: CollaborationProvider;
    user: Readonly<{ id: string; name: string; color: string }>;
  }>,
  imageExtension?: typeof PageDocumentImage,
): Extensions {
  const collaborationCaret = collaboration
    ? [
        CollaborationCaret.configure({
          provider: collaboration.provider,
          render: (user) => {
            const cursor = globalThis.document.createElement('span');
            const color = resolvePresenceColor(user.id, user.color);
            cursor.classList.add('collaboration-carets__caret');
            cursor.setAttribute('style', `border-color: ${color}`);

            const label = globalThis.document.createElement('div');
            label.classList.add('collaboration-carets__label');
            label.setAttribute('style', `background-color: ${color}`);
            label.append(globalThis.document.createTextNode(String(user.name ?? '')));
            cursor.append(label);

            return cursor;
          },
          selectionRender: (user) => ({
            class: 'collaboration-carets__selection',
            style: `background-color: ${resolvePresenceColor(user.id, user.color)}70`,
          }),
          user: collaboration.user,
        }),
      ]
    : [];

  return [
    ...createPageDocumentSchemaExtensions().map((extension) =>
      extension.name === 'image' && imageExtension ? imageExtension : extension,
    ),
    PageDocumentNodeIdDeconflict,
    Collaboration.configure({
      document,
      field: PAGE_CONTENT_YJS_FIELD,
    }),
    ...collaborationCaret,
  ];
}
