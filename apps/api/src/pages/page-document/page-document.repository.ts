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
  storageRevision: bigint;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

export interface ReplaceDocumentInput {
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

const DOCUMENT_FIELDS = {
  pageId: true,
  storageRevision: true,
  tiptapSchemaVersion: true,
  yjsState: true,
} as const;

/**
 * Абстрактный класс служит DI-токеном; тесты подставляют in-memory реализацию.
 *
 * Живость проверяется условием самого запроса через связь с `Page`: отдельное
 * чтение страницы открыло бы окно между проверкой и обращением к строке. Права
 * здесь не проверяются — у документа их нет своих, и роль спрашивает сервис.
 */
@Injectable()
export abstract class PageDocumentRepository {
  abstract bind(scope: TransactionScope): PageDocumentRepository;

  abstract find(pageId: string): Promise<PageDocumentRecord | null>;

  /**
   * Пустой документ создаваемой страницы. Владелец не проверяется: строка страницы
   * вставлена той же транзакцией строкой выше.
   */
  abstract insertEmpty(pageId: string, tiptapSchemaVersion: number): Promise<void>;

  /** `null`, когда страницы нет либо она лежит в корзине. */
  abstract replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null>;

  /** В отличие от `replace`, не трогает `tiptapSchemaVersion`. */
  abstract replaceYjsState(pageId: string, yjsState: Bytes): Promise<PageDocumentRecord | null>;
}

@Injectable()
export class PrismaPageDocumentRepository extends PageDocumentRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPageDocumentRepository {
    return new PrismaPageDocumentRepository(databaseClientOf(scope));
  }

  find(pageId: string): Promise<PageDocumentRecord | null> {
    return this.client.pageDocument.findFirst({
      select: DOCUMENT_FIELDS,
      where: { page: { deletedAt: null }, pageId },
    });
  }

  async insertEmpty(pageId: string, tiptapSchemaVersion: number): Promise<void> {
    await this.client.pageDocument.create({
      data: { pageId, tiptapSchemaVersion, yjsState: new Uint8Array() },
    });
  }

  async replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null> {
    // Raw SQL keeps the live-page check, state write, storageRevision increment and
    // RETURNING in one statement, so concurrent writes cannot mix bytes and metadata.
    const records = await this.client.$queryRaw<PageDocumentRecord[]>`
      UPDATE "PageDocument" AS document
      SET "storageRevision" = document."storageRevision" + 1,
          "tiptapSchemaVersion" = ${input.tiptapSchemaVersion},
          "yjsState" = ${input.yjsState},
          "updatedAt" = NOW()
      WHERE document."pageId" = ${input.pageId}::uuid
        AND EXISTS (
          SELECT 1
          FROM "Page" AS page
          WHERE page.id = document."pageId"
            AND page."deletedAt" IS NULL
        )
      RETURNING document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
    `;

    return records[0] ?? null;
  }

  async replaceYjsState(pageId: string, yjsState: Bytes): Promise<PageDocumentRecord | null> {
    // Raw SQL keeps the live-page check, state write, storageRevision increment and
    // RETURNING in one statement, so concurrent writes cannot mix bytes and metadata.
    const records = await this.client.$queryRaw<PageDocumentRecord[]>`
      UPDATE "PageDocument" AS document
      SET "storageRevision" = document."storageRevision" + 1,
          "yjsState" = ${yjsState},
          "updatedAt" = NOW()
      WHERE document."pageId" = ${pageId}::uuid
        AND EXISTS (
          SELECT 1
          FROM "Page" AS page
          WHERE page.id = document."pageId"
            AND page."deletedAt" IS NULL
        )
      RETURNING document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
    `;

    return records[0] ?? null;
  }
}
