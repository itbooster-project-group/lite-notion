import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../../database/transaction';
import type { Bytes } from '../pages.repository';

export interface PageDocumentRecord {
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

export interface ReplaceDocumentInput {
  pageId: string;
  ownerId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

const DOCUMENT_FIELDS = { pageId: true, tiptapSchemaVersion: true, yjsState: true } as const;

/**
 * Абстрактный класс служит DI-токеном; тесты подставляют in-memory реализацию.
 *
 * Живость и владелец проверяются условием самого запроса через связь с `Page`: у
 * документа своих прав нет, а отдельное чтение страницы открыло бы окно между
 * проверкой и обращением к строке.
 */
@Injectable()
export abstract class PageDocumentRepository {
  abstract bind(scope: TransactionScope): PageDocumentRepository;

  abstract find(pageId: string, ownerId: string): Promise<PageDocumentRecord | null>;

  /**
   * Пустой документ создаваемой страницы. Владелец не проверяется: строка страницы
   * вставлена той же транзакцией строкой выше.
   */
  abstract insertEmpty(pageId: string, tiptapSchemaVersion: number): Promise<void>;

  /** `null`, когда страницы нет, она чужая или лежит в корзине. */
  abstract replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null>;
}

@Injectable()
export class PrismaPageDocumentRepository extends PageDocumentRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPageDocumentRepository {
    return new PrismaPageDocumentRepository(databaseClientOf(scope));
  }

  find(pageId: string, ownerId: string): Promise<PageDocumentRecord | null> {
    return this.client.pageDocument.findFirst({
      select: DOCUMENT_FIELDS,
      where: { page: { deletedAt: null, ownerId }, pageId },
    });
  }

  async insertEmpty(pageId: string, tiptapSchemaVersion: number): Promise<void> {
    await this.client.pageDocument.create({
      data: { pageId, tiptapSchemaVersion, yjsState: new Uint8Array() },
    });
  }

  async replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null> {
    const { count } = await this.client.pageDocument.updateMany({
      data: {
        storageRevision: { increment: 1 },
        tiptapSchemaVersion: input.tiptapSchemaVersion,
        yjsState: input.yjsState,
      },
      // Мягкое удаление строку документа не трогает, поэтому одного `pageId` мало:
      // условие по связи делает проверку и запись одним UPDATE.
      where: { page: { deletedAt: null, ownerId: input.ownerId }, pageId: input.pageId },
    });

    return count === 0 ? null : this.find(input.pageId, input.ownerId);
  }
}
