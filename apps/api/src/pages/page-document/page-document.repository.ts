import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Bytes } from '../pages.repository';

export interface PageDocumentRecord {
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

export interface ReplaceDocumentInput {
  pageId: string;
  tiptapSchemaVersion: number;
  yjsState: Bytes;
}

const DOCUMENT_FIELDS = { pageId: true, tiptapSchemaVersion: true, yjsState: true } as const;

/**
 * Доступ к содержимому документа. Абстрактный класс, а не интерфейс: он же
 * служит DI-токеном, и тесты подставляют вместо него in-memory реализацию.
 *
 * Владельца здесь нет намеренно: принадлежность страницы — правило дерева, и
 * проверяет его `PagesService`. Репозиторий адресует строку по `pageId` и ничего
 * не знает ни о пользователях, ни о правах.
 */
@Injectable()
export abstract class PageDocumentRepository {
  abstract find(pageId: string): Promise<PageDocumentRecord | null>;

  /**
   * `null`, когда страницы уже нет или она лежит в корзине. Проверка живости
   * идёт условием самой записи, а не отдельным запросом до неё: между двумя
   * запросами страницу успевают удалить, и содержимое ушло бы в корзину.
   */
  abstract replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null>;
}

@Injectable()
export class PrismaPageDocumentRepository extends PageDocumentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  find(pageId: string): Promise<PageDocumentRecord | null> {
    return this.prisma.pageDocument.findUnique({ select: DOCUMENT_FIELDS, where: { pageId } });
  }

  async replace(input: ReplaceDocumentInput): Promise<PageDocumentRecord | null> {
    const { count } = await this.prisma.pageDocument.updateMany({
      data: {
        storageRevision: { increment: 1 },
        tiptapSchemaVersion: input.tiptapSchemaVersion,
        yjsState: input.yjsState,
      },
      // Мягкое удаление строку документа не трогает, поэтому одного `pageId`
      // мало: условие живости страницы делает проверку и запись одним UPDATE.
      where: { page: { deletedAt: null }, pageId: input.pageId },
    });

    return count === 0 ? null : this.find(input.pageId);
  }
}
