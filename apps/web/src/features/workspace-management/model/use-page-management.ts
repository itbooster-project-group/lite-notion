'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  insertPageIntoTree,
  type MoveIntent,
  mapMoveIntentToDto,
  movePageInTree,
  normalizePageTree,
  renamePageInTree,
} from '@/entities/page';
import {
  type CreatePageDto,
  getGetPageTreeQueryKey,
  type PageTreeNodeDto,
  useCreatePage as useCreatePageMutation,
  useMovePage as useMovePageMutation,
  useRenamePage as useRenamePageMutation,
} from '@/shared/api';

export function usePageManagement() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createMutation = useCreatePageMutation();
  const renameMutation = useRenamePageMutation();
  const moveMutation = useMovePageMutation();

  async function createPage(projectId: string, parentPageId: string | null, title: string) {
    if (createMutation.isPending) throw new Error('Create unavailable');
    const payload = { parentPageId, projectId, title } satisfies CreatePageDto;
    const page = await createMutation.mutateAsync({ data: payload });
    queryClient.setQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey(), (current) =>
      insertPageIntoTree(current ?? [], page),
    );
    router.push(`/pages/${page.id}`);
  }

  async function renamePage(pageId: string, title: string) {
    if (renameMutation.isPending) throw new Error('Rename pending');
    const queryKey = getGetPageTreeQueryKey();
    await queryClient.cancelQueries({ queryKey });
    const snapshot = queryClient.getQueryData<PageTreeNodeDto[]>(queryKey);
    queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
      renamePageInTree(current ?? [], pageId, title),
    );

    try {
      await renameMutation.mutateAsync({ data: { title }, pageId });
    } catch (error) {
      queryClient.setQueryData(queryKey, snapshot);
      throw error;
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  async function movePage(intent: MoveIntent) {
    if (moveMutation.isPending) throw new Error('Move pending');
    const queryKey = getGetPageTreeQueryKey();
    await queryClient.cancelQueries({ queryKey });
    const snapshot = queryClient.getQueryData<PageTreeNodeDto[]>(queryKey) ?? [];
    const payload = mapMoveIntentToDto(normalizePageTree(snapshot), intent);
    if (!payload) throw new Error('Invalid move');

    queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
      movePageInTree(current ?? [], intent),
    );

    try {
      await moveMutation.mutateAsync({ data: payload, pageId: intent.pageId });
    } catch (error) {
      queryClient.setQueryData(queryKey, snapshot);
      throw error;
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  return {
    createPage,
    isCreatingPage: createMutation.isPending,
    movePage,
    renamePage,
  } as const;
}
