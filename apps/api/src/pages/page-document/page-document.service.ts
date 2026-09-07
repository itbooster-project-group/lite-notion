import { Inject, Injectable } from '@nestjs/common';

import { PageNotFoundError } from '../errors';
import type { Bytes } from '../pages.repository';
import { type PageDocumentRecord, PageDocumentRepository } from './page-document.repository';

export interface ReplaceDocumentCommand {
  ownerId: string;
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

/**
 * Отдельно от `PagesService`: у документа нет ни блокировок, ни рангов — только
 * чтение и замена байтов. Права проверяет запрос через связь с `Page`.
 */
@Injectable()
export class PageDocumentService {
  constructor(@Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository) {}

  async read(pageId: string, ownerId: string): Promise<PageDocumentRecord> {
    return this.require(await this.documents.find(pageId, ownerId));
  }

  async replace(command: ReplaceDocumentCommand): Promise<PageDocumentRecord> {
    return this.require(
      await this.documents.replace({
        ownerId: command.ownerId,
        pageId: command.pageId,
        tiptapSchemaVersion: command.tiptapSchemaVersion,
        yjsState: command.yjsState,
      }),
    );
  }

  /**
   * Связь «страница — документ» обязательна, поэтому после успешной проверки
   * страницы строка обязана существовать. `null` здесь означает, что страница
   * исчезла между двумя запросами: это тот же `404`, а не внутренняя ошибка.
   */
  private require(document: PageDocumentRecord | null): PageDocumentRecord {
    if (document === null) {
      throw new PageNotFoundError();
    }

    return document;
  }
}
