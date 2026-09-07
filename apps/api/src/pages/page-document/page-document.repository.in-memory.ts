import type { TransactionScope } from '../../database/transaction';
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
  /** Позволяет тесту уронить вставку документа, не трогая Prisma. */
  failInsert = false;

  /** `pages` нужен обеим операциям: права и живость проверяются через связь. */
  constructor(
    readonly documents: Map<string, StoredDocument> = new Map(),
    readonly pages: Map<string, StoredPage> = new Map(),
  ) {
    super();
  }

  bind(_scope: TransactionScope): InMemoryPageDocumentRepository {
    return this;
  }

  async find(pageId: string, ownerId: string): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(pageId);

    return document === undefined || !this.isVisible(pageId, ownerId)
      ? null
      : {
          pageId,
          tiptapSchemaVersion: document.tiptapSchemaVersion,
          yjsState: document.yjsState,
        };
  }

  async insertEmpty(pageId: string, tiptapSchemaVersion: number): Promise<void> {
    if (this.failInsert) {
      throw new Error('document insert failed');
    }

    this.documents.set(pageId, {
      storageRevision: 0,
      tiptapSchemaVersion,
      yjsState: new Uint8Array(),
    });
  }

  async replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(input.pageId);

    if (document === undefined || !this.isVisible(input.pageId, input.ownerId)) {
      return null;
    }

    document.storageRevision += 1;
    document.tiptapSchemaVersion = input.tiptapSchemaVersion;
    document.yjsState = input.yjsState;

    return this.find(input.pageId, input.ownerId);
  }

  /** Отсутствующая в хранилище страница считается живой: в базе её держит FK. */
  private isVisible(pageId: string, ownerId: string): boolean {
    const page = this.pages.get(pageId);

    return page === undefined || (page.deletedAt === null && page.ownerId === ownerId);
  }
}
