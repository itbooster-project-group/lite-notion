import type { PageDocumentErrorCode } from '@/features/page-editing';

const DOCUMENT_ERROR_MESSAGES: Record<PageDocumentErrorCode, string> = {
  'document-decode-failed': 'Документ не удалось открыть.',
  'invalid-document-metadata': 'Метаданные документа некорректны.',
  'unsupported-schema-version': 'Версия документа не поддерживается.',
};

type EditorStatusProps = Readonly<
  | { status: 'loading' }
  | { status: 'error'; errorCode?: PageDocumentErrorCode }
  | { status: 'read-only' }
>;

export function EditorStatus(props: EditorStatusProps) {
  if (props.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" role="status">
        Подготавливаем документ…
      </div>
    );
  }

  if (props.status === 'error') {
    return (
      <div role="alert">
        {props.errorCode
          ? DOCUMENT_ERROR_MESSAGES[props.errorCode]
          : 'Документ временно недоступен.'}
      </div>
    );
  }

  return (
    <div aria-live="polite" role="status">
      Документ открыт только для чтения.
    </div>
  );
}
