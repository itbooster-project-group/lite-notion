export type WorkspaceRouteContext =
  | Readonly<{ type: 'root' }>
  | Readonly<{ projectId: string; type: 'project' }>
  | Readonly<{ pageId: string; type: 'page' }>;

export function parseWorkspaceRoutePathname(pathname: string): WorkspaceRouteContext | undefined {
  if (pathname === workspaceRootPath()) return { type: 'root' };

  const projectMatch = /^\/projects\/([^/]+)$/.exec(pathname);
  if (projectMatch?.[1]) return { projectId: projectMatch[1], type: 'project' };

  const pageMatch = /^\/pages\/([^/]+)$/.exec(pathname);
  if (pageMatch?.[1]) return { pageId: pageMatch[1], type: 'page' };

  return undefined;
}

export function workspaceRootPath(): string {
  return '/';
}

export function workspaceProjectPath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function workspacePagePath(pageId: string): string {
  return `/pages/${pageId}`;
}
