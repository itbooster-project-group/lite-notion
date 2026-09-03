'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  collectPageSubtreeIds,
  insertPageIntoTree,
  isPageInSubtree,
  type MoveIntent,
  mapMoveIntentToDto,
  movePageInTree,
  normalizePageTree,
  removePageSubtreeFromTree,
  renamePageInTree,
  selectPage,
} from '@/entities/page';
import {
  type CreatePageDto,
  getGetPageTreeQueryKey,
  type PageTreeNodeDto,
  useCreatePage as useCreatePageMutation,
  useDeletePage as useDeletePageMutation,
  useMovePage as useMovePageMutation,
  useRenamePage as useRenamePageMutation,
} from '@/shared/api';
import {
  type WorkspaceRouteContext,
  workspacePagePath,
  workspaceProjectPath,
} from '@/shared/routing';
import { useWorkspaceDeleteCleanupCoordinator } from './delete-cleanup-coordinator';

export function usePageManagement(routeContext: WorkspaceRouteContext) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteCleanupCoordinator = useWorkspaceDeleteCleanupCoordinator();
  const createMutation = useCreatePageMutation();
  const renameMutation = useRenamePageMutation();
  const moveMutation = useMovePageMutation();
  const deleteMutation = useDeletePageMutation();

  async function createPage(projectId: string, parentPageId: string | null, title: string) {
    if (createMutation.isPending) throw new Error('Create unavailable');
    const payload = { parentPageId, projectId, title } satisfies CreatePageDto;
    const page = await createMutation.mutateAsync({ data: payload });
    queryClient.setQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey(), (current) =>
      insertPageIntoTree(current ?? [], page),
    );
    router.push(workspacePagePath(page.id));
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

  async function deletePage(pageId: string) {
    if (deleteMutation.isPending) throw new Error('Delete pending');
    const queryKey = getGetPageTreeQueryKey();
    const snapshot = queryClient.getQueryData<PageTreeNodeDto[]>(queryKey) ?? [];
    const normalizedTree = normalizePageTree(snapshot);
    const page = selectPage(normalizedTree, pageId);
    if (!page) throw new Error('Delete unavailable');

    const subtreePageIds = collectPageSubtreeIds(normalizedTree, pageId);
    const affectsCurrentRoute =
      routeContext.type === 'page' && isPageInSubtree(normalizedTree, pageId, routeContext.pageId);

    await deleteMutation.mutateAsync({ pageId });

    if (affectsCurrentRoute) {
      router.replace(workspaceProjectPath(page.projectId));
      deleteCleanupCoordinator.schedulePageDeleteCleanup({
        kind: 'page',
        oldRoute: routeContext,
        projectId: page.projectId,
        subtreePageIds,
        subtreeRootPageId: pageId,
      });
      return;
    }

    queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
      removePageSubtreeFromTree(current ?? [], pageId),
    );
    void queryClient.invalidateQueries({ queryKey });
  }

  return {
    createPage,
    deletePage,
    isDeletingPage: deleteMutation.isPending,
    isCreatingPage: createMutation.isPending,
    movePage,
    renamePage,
  } as const;
}
