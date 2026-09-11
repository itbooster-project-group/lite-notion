import type { PageDto } from '@/shared/api';

export type PageAccessRole = PageDto['accessRole'];

export type PageCapabilities = Readonly<{
  role: PageAccessRole;
  canEditContent: boolean;
  canCreateChild: boolean;
  canRenamePage: boolean;
  canMovePage: boolean;
  canDeletePage: boolean;
  canManageAccess: boolean;
  canManagePage: boolean;
}>;

export function getPageCapabilities(accessRole: PageAccessRole): PageCapabilities {
  const isOwner = accessRole === 'owner';
  const isEditor = accessRole === 'editor';

  return {
    canCreateChild: isOwner || isEditor,
    canDeletePage: isOwner,
    canEditContent: isOwner || isEditor,
    canManageAccess: isOwner,
    canManagePage: isOwner || isEditor,
    canMovePage: isOwner,
    canRenamePage: isOwner || isEditor,
    role: accessRole,
  };
}
