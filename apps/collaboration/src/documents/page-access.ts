import { ApiDeniedError, type InternalApiClient } from '../api/internal-api-client.js';

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
 * Допуск к комнате. Роль вычисляет API — та же модель, что отвечает REST, — поэтому
 * расхождение решений для одной пары невозможно конструктивно.
 */
export class PageAccessService {
  constructor(private readonly api: InternalApiClient) {}

  /**
   * Токен пользователя пробрасывается без изменений: личность выводится только из
   * него. Недоступность API наверх уходит как есть — это не отказ в доступе.
   */
  async authorize(token: string, pageId: string): Promise<PageAccess> {
    try {
      const verdict = await this.api.authorizePage(token, pageId);

      return {
        canRead: true,
        canWrite: verdict.canWrite,
        pageId: verdict.pageId,
        userId: verdict.userId,
      };
    } catch (error) {
      if (error instanceof ApiDeniedError) {
        throw new PageAccessDeniedError();
      }

      throw error;
    }
  }
}
