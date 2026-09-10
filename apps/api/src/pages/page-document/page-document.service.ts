import { PageRole } from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import { PagePermissionsService } from '../../page-permissions/page-permissions.service';
import { PageNotFoundError } from '../errors';
import type { Bytes } from '../pages.repository';
import { type PageDocumentRecord, PageDocumentRepository } from './page-document.repository';

export interface ReplaceDocumentCommand {
  actorId: string;
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

/**
 * Отдельно от `PagesService`: у документа нет ни блокировок, ни рангов — только
 * чтение и замена байтов. Права у документа тоже не свои: он доступен ровно тем,
 * кому доступна его страница, и той же моделью.
 */
@Injectable()
export class PageDocumentService {
  constructor(
    @Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

  /** Чтение содержимого — то же, что чтение страницы, поэтому `viewer`. */
  async read(pageId: string, actorId: string): Promise<PageDocumentRecord> {
    await this.permissions.requireRole(actorId, pageId, PageRole.VIEWER);

    return this.require(await this.documents.find(pageId));
  }

  /** Запись — изменение страницы, поэтому `editor`: читателю её не хватает. */
  async replace(command: ReplaceDocumentCommand): Promise<PageDocumentRecord> {
    await this.permissions.requireRole(command.actorId, command.pageId, PageRole.EDITOR);

    return this.require(
      await this.documents.replace({
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
