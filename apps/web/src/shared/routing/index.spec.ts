import { describe, expect, it } from 'vitest';

import { parseWorkspaceRoutePathname } from './index';

describe('parseWorkspaceRoutePathname', () => {
  it.each([
    ['/', { type: 'root' }],
    ['/projects/project-a', { projectId: 'project-a', type: 'project' }],
    ['/pages/child', { pageId: 'child', type: 'page' }],
  ] as const)('возвращает workspace context для %s', (pathname, expected) => {
    expect(parseWorkspaceRoutePathname(pathname)).toEqual(expected);
  });

  it.each(['/profile', '/login', '/projects/project-a/settings', '/pages/child/history'])(
    'не создаёт workspace context для private/public route %s',
    (pathname) => {
      expect(parseWorkspaceRoutePathname(pathname)).toBeUndefined();
    },
  );
});
