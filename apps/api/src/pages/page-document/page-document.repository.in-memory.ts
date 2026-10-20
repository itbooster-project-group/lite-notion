import type { TransactionScope } from '../../database/transaction';
import type { Bytes } from '../pages.repository';
import type { StoredDocument, StoredPage } from '../pages.repository.in-memory';
import { type PageDocumentRecord, PageDocumentRepository } from './page-document.repository';

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

  async find(pageId: string): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(pageId);

    return document === undefined || !this.isVisible(pageId)
      ? null
      : {
          pageId,
          storageRevision: BigInt(document.storageRevision),
          tiptapSchemaVersion: document.tiptapSchemaVersion,
          yjsState: document.yjsState,
        };
  }

  async lockForPublication(pageId: string): Promise<boolean> {
    return this.documents.has(pageId);
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

  async replaceYjsState(
    pageId: string,
    yjsState: Bytes,
    expectedStorageRevision: bigint,
    tiptapSchemaVersion: number,
  ): Promise<PageDocumentRecord | null> {
    const document = this.documents.get(pageId);

    if (
      document === undefined ||
      !this.isVisible(pageId) ||
      BigInt(document.storageRevision) !== expectedStorageRevision
    ) {
      return null;
    }

    document.storageRevision += 1;
    document.tiptapSchemaVersion = tiptapSchemaVersion;
    document.yjsState = yjsState;

    return this.find(pageId);
  }

  /** Живость, а не права: роль спрашивает сервис. Отсутствующую страницу в базе держит FK. */
  private isVisible(pageId: string): boolean {
    const page = this.pages.get(pageId);

    return page === undefined || page.deletedAt === null;
  }
}
