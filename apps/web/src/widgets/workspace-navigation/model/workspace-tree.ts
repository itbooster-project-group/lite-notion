import type { NormalizedPageTree } from '@/entities/page';
import type { ProjectDto } from '@/shared/api';

export const WORKSPACE_ROOT_ID = 'workspace:root';
const PROJECT_ITEM_PREFIX = 'project:';
const PAGE_ITEM_PREFIX = 'page:';

export type WorkspaceTreeItemData = Readonly<{
  id: string;
  kind: 'root' | 'project' | 'page';
  title: string;
  projectId: string | null;
  pageId: string | null;
  parentPageId: string | null;
  childrenIds: readonly string[];
  canHaveChildren: boolean;
  hasChildren: boolean;
}>;

export type WorkspaceTreeModel = Readonly<{
  rootItemId: string;
  items: Readonly<Record<string, WorkspaceTreeItemData>>;
}>;

export function getProjectItemId(projectId: string): string {
  return `${PROJECT_ITEM_PREFIX}${projectId}`;
}

export function getPageItemId(pageId: string): string {
  return `${PAGE_ITEM_PREFIX}${pageId}`;
}

export function buildWorkspaceTree(
  projects: readonly ProjectDto[],
  pageTree: NormalizedPageTree,
): WorkspaceTreeModel {
  const projectItemIds = projects.map((project) => getProjectItemId(project.id));
  const items: Record<string, WorkspaceTreeItemData> = {
    [WORKSPACE_ROOT_ID]: {
      id: WORKSPACE_ROOT_ID,
      kind: 'root',
      title: '',
      projectId: null,
      pageId: null,
      parentPageId: null,
      childrenIds: projectItemIds,
      canHaveChildren: true,
      hasChildren: projectItemIds.length > 0,
    },
  };

  for (const project of projects) {
    const childrenIds = (pageTree.rootIdsByProjectId[project.id] ?? []).map(getPageItemId);
    const projectItemId = getProjectItemId(project.id);
    items[projectItemId] = {
      id: projectItemId,
      kind: 'project',
      title: project.name,
      projectId: project.id,
      pageId: null,
      parentPageId: null,
      childrenIds,
      canHaveChildren: true,
      hasChildren: childrenIds.length > 0,
    };
  }

  for (const page of Object.values(pageTree.nodesById)) {
    const childrenIds = (pageTree.childIdsByParentId[page.id] ?? []).map(getPageItemId);
    items[getPageItemId(page.id)] = {
      id: getPageItemId(page.id),
      kind: 'page',
      title: page.title.trim() || 'Без названия',
      projectId: page.projectId,
      pageId: page.id,
      parentPageId: page.parentPageId,
      childrenIds,
      canHaveChildren: true,
      hasChildren: childrenIds.length > 0,
    };
  }

  return { rootItemId: WORKSPACE_ROOT_ID, items };
}
