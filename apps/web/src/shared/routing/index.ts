export type WorkspaceRouteContext =
  | Readonly<{ type: 'root' }>
  | Readonly<{ projectId: string; type: 'project' }>
  | Readonly<{ pageId: string; type: 'page' }>;

export function workspaceRootPath(): string {
  return '/';
}

export function workspaceProjectPath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function workspacePagePath(pageId: string): string {
  return `/pages/${pageId}`;
}
