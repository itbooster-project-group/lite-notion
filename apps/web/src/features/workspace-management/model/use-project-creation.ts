'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  type CreateProjectDto,
  getListProjectsQueryKey,
  type ProjectDto,
  useCreateProject as useCreateProjectMutation,
} from '@/shared/api';
import { workspaceProjectPath } from '@/shared/routing';

export function useProjectCreation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useCreateProjectMutation();

  async function createProject(name: string) {
    if (mutation.isPending) throw new Error('Create unavailable');
    const project = await mutation.mutateAsync({ data: { name } satisfies CreateProjectDto });
    queryClient.setQueryData<ProjectDto[]>(getListProjectsQueryKey(), (current) => [
      ...(current ?? []),
      project,
    ]);
    router.push(workspaceProjectPath(project.id));
  }

  return { createProject, isCreatingProject: mutation.isPending } as const;
}
