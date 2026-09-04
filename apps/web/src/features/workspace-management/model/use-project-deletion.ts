'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { normalizePageTree, removeProjectPagesFromTree, selectPage } from '@/entities/page';
import {
  getGetPageTreeQueryKey,
  getListProjectsQueryKey,
  type PageTreeNodeDto,
  type ProjectDto,
  useDeleteProject as useDeleteProjectMutation,
} from '@/shared/api';
import { type WorkspaceRouteContext, workspaceRootPath } from '@/shared/routing';
import { useWorkspaceDeleteCleanupCoordinator } from './delete-cleanup-coordinator';

export function useProjectDeletion(routeContext: WorkspaceRouteContext) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteCleanupCoordinator = useWorkspaceDeleteCleanupCoordinator();
  const deleteMutation = useDeleteProjectMutation();

  async function deleteProject(projectId: string) {
    if (deleteMutation.isPending) throw new Error('Delete pending');

    const pageTreeQueryKey = getGetPageTreeQueryKey();
    const pageTreeSnapshot = queryClient.getQueryData<PageTreeNodeDto[]>(pageTreeQueryKey) ?? [];
    const normalizedTree = normalizePageTree(pageTreeSnapshot);
    const projectsQueryKey = getListProjectsQueryKey();
    const affectsCurrentRoute =
      routeContext.type === 'project'
        ? routeContext.projectId === projectId
        : routeContext.type === 'page' &&
          selectPage(normalizedTree, routeContext.pageId)?.projectId === projectId;

    if (affectsCurrentRoute) {
      await queryClient.cancelQueries({ queryKey: pageTreeQueryKey });
      await queryClient.cancelQueries({ queryKey: projectsQueryKey });
    }

    await deleteMutation.mutateAsync({ projectId });

    if (affectsCurrentRoute) {
      router.replace(workspaceRootPath());
      deleteCleanupCoordinator.scheduleProjectDeleteCleanup({
        kind: 'project',
        oldRoute: routeContext,
        projectId,
      });
      return;
    }

    queryClient.setQueryData<ProjectDto[]>(projectsQueryKey, (current) =>
      (current ?? []).filter((project) => project.id !== projectId),
    );
    queryClient.setQueryData<PageTreeNodeDto[]>(pageTreeQueryKey, (current) =>
      removeProjectPagesFromTree(current ?? [], projectId),
    );
    void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    void queryClient.invalidateQueries({ queryKey: pageTreeQueryKey });
  }

  return { deleteProject, isDeletingProject: deleteMutation.isPending } as const;
}
