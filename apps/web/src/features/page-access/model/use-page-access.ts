'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPagePermissionsQueryKey,
  getGetPageQueryKey,
  getGetPageTreeQueryKey,
  type SetAccessModeDto,
  useGetPagePermissions,
  useGrantPagePermission,
  useRevokePagePermission,
  useSetPageAccessMode,
} from '@/shared/api';

export function usePageAccess(pageId: string) {
  const queryClient = useQueryClient();
  const permissionsQuery = useGetPagePermissions(pageId);
  const grantMutation = useGrantPagePermission();
  const revokeMutation = useRevokePagePermission();
  const accessModeMutation = useSetPageAccessMode();

  async function grant(email: string, role: 'viewer' | 'editor') {
    await grantMutation.mutateAsync({ pageId, data: { email, role } });
    await queryClient.invalidateQueries({ queryKey: getGetPagePermissionsQueryKey(pageId) });
  }

  async function revoke(userId: string) {
    await revokeMutation.mutateAsync({ pageId, userId });
    await queryClient.invalidateQueries({ queryKey: getGetPagePermissionsQueryKey(pageId) });
  }

  async function setAccessMode(accessMode: SetAccessModeDto['accessMode']) {
    const page = await accessModeMutation.mutateAsync({ pageId, data: { accessMode } });
    queryClient.setQueryData(getGetPageQueryKey(pageId), page);
    await queryClient.invalidateQueries({ queryKey: getGetPageTreeQueryKey() });
    return page;
  }

  return {
    accessModeMutation,
    grant,
    grantMutation,
    permissionsQuery,
    revoke,
    revokeMutation,
    setAccessMode,
  } as const;
}
