import type { PageRole } from '../../page-permissions/constants';
import type { PageAccessVerdict } from '../../page-permissions/page-permissions.service';

/** Право записи отдаётся полем, а не выводится из роли вызывающим. */
export class PageAccessDto {
  canWrite!: boolean;
  pageId!: string;
  role!: PageRole;
  userId!: string;

  static fromVerdict(verdict: PageAccessVerdict): PageAccessDto {
    return {
      canWrite: verdict.canWrite,
      pageId: verdict.pageId,
      role: verdict.role,
      userId: verdict.userId,
    };
  }
}
