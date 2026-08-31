'use client';

import { type PageDocumentSession, PageEditorSurface } from '@/features/page-editing';

import { EditorStatus } from './editor-status';

export type PageEditorProps = Readonly<{
  session: PageDocumentSession;
}>;

export function PageEditor({ session }: PageEditorProps) {
  if (session.status === 'loading') return <EditorStatus status="loading" />;

  if (session.status === 'error') {
    return session.error ? (
      <EditorStatus status="error" errorCode={session.error.code} />
    ) : (
      <EditorStatus status="error" />
    );
  }

  if (!session.doc) return <EditorStatus status="error" />;

  return (
    <div className="w-full" data-page-editor="">
      {!session.editable && <EditorStatus status="read-only" />}
      <PageEditorSurface doc={session.doc} editable={session.editable} />
    </div>
  );
}
