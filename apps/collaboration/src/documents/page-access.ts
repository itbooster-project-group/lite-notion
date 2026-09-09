import type { PrismaClient } from '@lite-notion/database';

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

export class PageAccessService {
  constructor(private readonly prisma: PrismaClient) {}

  async authorize(userId: string, pageId: string): Promise<PageAccess> {
    const page = await this.prisma.page.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        document: { isNot: null },
        id: pageId,
        ownerId: userId,
      },
    });

    if (!page) {
      throw new PageAccessDeniedError();
    }

    return {
      canRead: true,
      canWrite: true,
      pageId: page.id,
      userId,
    };
  }
}
