import type { StoredDocument, StoredPage } from '../pages.repository.in-memory';
import {
  type PageDocumentRecord,
  PageDocumentRepository,
  type ReplaceDocumentInput,
} from './page-document.repository';

/**
 * Тестовая реализация. Хранилище то же, что у `InMemoryPagesRepository`: в базе
 * это одна таблица, и документ, созданный вместе со страницей, обязан быть виден
 * отсюда. Тесты передают общие Map в оба репозитория.
 */
export class InMemoryPageDocumentRepository extends PageDocumentRepository {
  /**
   * `pages` нужен только записи: она отказывает по удалённой странице. Страница,
   * которой нет в хранилище, считается живой — как и проект в
   * `InMemoryPagesRepository`: тест, не заводивший страниц, не обязан их заводить,
   * а в базе документа без страницы не бывает — его не пустил бы FK.
   */
  constructor(
    readonly documents: Map<string, StoredDocument> = new Map(),
    readonly pages: Map<string, StoredPage> = new Map(),
  ) {
    super();
  }

  async find(pageId: string): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(pageId);

    return document === undefined
      ? null
      : {
          pageId,
          tiptapSchemaVersion: document.tiptapSchemaVersion,
          yjsState: document.yjsState,
        };
  }

  async replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(input.pageId);

    if (document === undefined || this.pages.get(input.pageId)?.deletedAt != null) {
      return null;
    }

    document.storageRevision += 1;
    document.tiptapSchemaVersion = input.tiptapSchemaVersion;
    document.yjsState = input.yjsState;

    return this.find(input.pageId);
  }
}
