import type { PrismaClient } from '@lite-notion/database';
import { PageRole, resolveEffectiveRole, roleAtLeast } from '@lite-notion/page-permissions';

export interface PageAccess {
  canRead: boolean;
  canWrite: boolean;
  pageId: string;
  userId: string;
}

export class PageAccessDeniedError extends Error {
  constructor() {
    super('Page access denied');
  }
}

/**
 * Решение о допуске к комнате. Собственных правил здесь нет: роль вычисляет общий
 * пакет — тот же, которым пользуется REST API, — иначе одна и та же пара
 * «пользователь — страница» получала бы у двух процессов разные ответы.
 */
export class PageAccessService {
  constructor(private readonly prisma: PrismaClient) {}

  async authorize(userId: string, pageId: string): Promise<PageAccess> {
    const role = await resolveEffectiveRole(this.prisma, userId, pageId);

    // Отказ один на все причины: отсутствие страницы, отсутствие доступа, удаление
    // и граница restricted снаружи неразличимы.
    if (role === null || !(await this.hasDocument(pageId))) {
      throw new PageAccessDeniedError();
    }

    return {
      canRead: true,
      canWrite: roleAtLeast(role, PageRole.EDITOR),
      pageId,
      userId,
    };
  }

  /**
   * Проверка про комнату, а не про права: страница без документа существовать не
   * должна, но открывать для неё комнату всё равно нельзя.
   */
  private async hasDocument(pageId: string): Promise<boolean> {
    const document = await this.prisma.pageDocument.findUnique({
      select: { pageId: true },
      where: { pageId },
    });

    return document !== null;
  }
}
