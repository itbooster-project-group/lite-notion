import {
  ApiDeniedError,
  type InternalApiClient,
  type PageAccessVerdict,
  type VerifiedIdentity,
} from './internal-api-client.js';

export interface InMemoryApiPage {
  canWrite: boolean;
  deleted: boolean;
  yjsState: Uint8Array;
}

/**
 * Двойник внутренних маршрутов API. Держит ровно то, что видит collaboration:
 * вердикт о доступе и байты документа.
 */
export class InMemoryInternalApiClient {
  readonly pages = new Map<string, InMemoryApiPage>();
  readonly users = new Map<string, string>();
  unavailable = false;
  expiresInMs = 900_000;
  authenticateCalls = 0;
  authorizeCalls = 0;

  grant(pageId: string, token: string, userId: string, canWrite: boolean): void {
    this.users.set(token, userId);
    this.pages.set(`${pageId}:${userId}`, {
      canWrite,
      deleted: false,
      yjsState: this.pages.get(`${pageId}:${userId}`)?.yjsState ?? new Uint8Array(),
    });
  }

  revoke(pageId: string, userId: string): void {
    this.pages.delete(`${pageId}:${userId}`);
  }

  downgrade(pageId: string, userId: string): void {
    const page = this.pages.get(`${pageId}:${userId}`);

    if (page) {
      page.canWrite = false;
    }
  }

  asClient(): InternalApiClient {
    const documents = new Map<string, Uint8Array>();

    const guard = (): void => {
      if (this.unavailable) {
        throw new Error('unavailable');
      }
    };

    return {
      authenticate: async (token: string): Promise<VerifiedIdentity> => {
        guard();
        this.authenticateCalls += 1;
        const userId = this.users.get(token);

        if (userId === undefined) {
          throw new ApiDeniedError(401);
        }

        return {
          expiresAt: new Date(Date.now() + this.expiresInMs),
          sessionId: 'session',
          userId,
        };
      },
      authorizePage: async (token: string, pageId: string): Promise<PageAccessVerdict> => {
        guard();
        this.authorizeCalls += 1;
        const userId = this.users.get(token);
        const page = userId === undefined ? undefined : this.pages.get(`${pageId}:${userId}`);

        if (userId === undefined || page === undefined || page.deleted) {
          throw new ApiDeniedError(404);
        }

        return {
          canWrite: page.canWrite,
          pageId,
          role: page.canWrite ? 'editor' : 'viewer',
          userId,
        };
      },
      readDocument: async (pageId: string): Promise<Uint8Array> => {
        guard();
        const state = documents.get(pageId);

        if (this.isDeleted(pageId)) {
          throw new ApiDeniedError(404);
        }

        return state ?? new Uint8Array();
      },
      replaceDocument: async (pageId: string, yjsState: Uint8Array): Promise<void> => {
        guard();

        if (this.isDeleted(pageId)) {
          throw new ApiDeniedError(404);
        }

        documents.set(pageId, yjsState);
      },
    } as unknown as InternalApiClient;
  }

  deletePage(pageId: string): void {
    for (const [key, page] of this.pages) {
      if (key.startsWith(`${pageId}:`)) {
        page.deleted = true;
      }
    }
  }

  private isDeleted(pageId: string): boolean {
    for (const [key, page] of this.pages) {
      if (key.startsWith(`${pageId}:`) && page.deleted) {
        return true;
      }
    }

    return false;
  }
}
